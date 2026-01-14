"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useNotification } from "@/hooks/use-notification";
import { backendApi } from "@/lib/api/endpoints";
import { ArrowLeft, Check, Upload, MapPin, Eye, Loader2, FileSpreadsheet, ChevronLeft, ChevronRight, CheckCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useState, useEffect, useMemo } from "react";
import useSWR from "swr";

// ============================================================================
// TYPES & CONSTANTS
// ============================================================================

type StepId = "upload" | "mapping" | "review" | "import";

interface StepConfig {
    id: StepId;
    label: string;
    icon: React.ElementType;
}

const STEP_CONFIG: StepConfig[] = [
    { id: "upload", label: "Upload", icon: Upload },
    { id: "mapping", label: "Map Fields", icon: MapPin },
    { id: "review", label: "Review", icon: Eye },
    { id: "import", label: "Import", icon: CheckCircle },
];

const PAGE_SIZE = 20;

const INTERNAL_FIELDS = [
    { key: "first_name", label: "First Name", required: true },
    { key: "last_name", label: "Last Name", required: false },
    { key: "phone_number", label: "Phone Number", required: true },
    { key: "email", label: "Email", required: false },
    { key: "country_code", label: "Country Code", required: true },
    { key: "language", label: "Language", required: false },
];

interface FieldMappingData {
    mapping?: Record<string, string | null>;
    suggestions?: Array<{
        sourceColumn: string;
        suggestedField: string | null;
        confidence: number;
    }>;
    headers?: string[];
}

interface ImportJob {
    id: string;
    userId: number;
    status: string;
    originalFilename: string | null;
    totalRows: number;
    validRows: number;
    invalidRows: number;
    duplicateRows: number;
    fieldMapping: FieldMappingData | null;
    errorMessage: string | null;
    createdAt: string;
    updatedAt: string;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function ContactsImportPage() {
    const router = useRouter();
    const params = useParams();
    const locale = params.locale as string;
    const t = useTranslations("contacts");
    const { addNotification } = useNotification();

    // State
    const [currentStep, setCurrentStep] = useState<StepId>("upload");
    const [jobId, setJobId] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [fieldMapping, setFieldMapping] = useState<Record<string, string | null>>({});
    const [previewPage, setPreviewPage] = useState(0);
    const [highestCompletedStep, setHighestCompletedStep] = useState<number>(-1);

    // Derived values
    const currentStepIndex = useMemo(() =>
        STEP_CONFIG.findIndex(s => s.id === currentStep),
        [currentStep]
    );

    // ========================================================================
    // DATA FETCHING
    // ========================================================================

    // Determine if we should poll for job updates
    const shouldPollJob = useMemo(() => {
        if (!jobId) return false;
        // Poll during validation or import
        return currentStep === "review" || currentStep === "import";
    }, [jobId, currentStep]);

    // Fetch job data
    const { data: job, mutate: mutateJob } = useSWR<ImportJob>(
        jobId ? `import-job-${jobId}` : null,
        () => backendApi.importJobs.get(jobId!) as Promise<ImportJob>,
        { refreshInterval: shouldPollJob ? 1000 : 0 }
    );

    // Fetch preview data with pagination
    const { data: preview } = useSWR(
        jobId && currentStep === "review" && job?.status === "VALIDATED"
            ? `import-preview-${jobId}-${previewPage}`
            : null,
        () => backendApi.importJobs.getPreview(jobId!, { take: PAGE_SIZE, skip: previewPage * PAGE_SIZE })
    );

    // ========================================================================
    // NAVIGATION HELPERS
    // ========================================================================

    /**
     * Check if user can navigate to a specific step
     */
    const canNavigateToStep = useCallback((stepIndex: number): boolean => {
        // Can always go to current or earlier completed steps
        if (stepIndex <= highestCompletedStep) return true;
        // Can go to step immediately after highest completed (if prerequisites met)
        if (stepIndex === highestCompletedStep + 1) {
            if (stepIndex === 1) return !!jobId; // Need job for mapping
            if (stepIndex === 2) return job?.status === "VALIDATED"; // Need validated for review
            // Can't skip to import
        }
        return false;
    }, [highestCompletedStep, jobId, job?.status]);

    /**
     * Handle step click navigation
     */
    const handleStepClick = useCallback((stepIndex: number) => {
        if (!canNavigateToStep(stepIndex)) return;
        const step = STEP_CONFIG[stepIndex];
        setCurrentStep(step.id);
        if (step.id === "review") setPreviewPage(0);
    }, [canNavigateToStep]);

    // ========================================================================
    // EFFECTS
    // ========================================================================

    // Initialize field mapping from job suggestions
    useEffect(() => {
        if (job?.fieldMapping?.suggestions) {
            const initialMapping: Record<string, string | null> = {};
            job.fieldMapping.suggestions.forEach((s) => {
                if (s.suggestedField && s.confidence > 0.5) {
                    initialMapping[s.sourceColumn] = s.suggestedField;
                }
            });
            setFieldMapping(initialMapping);
        }
    }, [job?.fieldMapping?.suggestions]);

    // Auto-advance from VALIDATING to VALIDATED
    useEffect(() => {
        if (job?.status === "VALIDATED" && currentStep === "review") {
            // Update highest completed to review
            setHighestCompletedStep(prev => Math.max(prev, 2));
        }
    }, [job?.status, currentStep]);

    // ========================================================================
    // FILE UPLOAD HANDLER
    // ========================================================================

    const handleFileUpload = useCallback(async (file: File) => {
        if (!file) return;

        const validTypes = [".csv", ".xlsx", ".xls"];
        const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
        if (!validTypes.includes(ext)) {
            addNotification(t("import.upload.error.invalidType"), "error");
            return;
        }

        setIsUploading(true);
        try {
            // Create job and get presigned URL
            const { jobId: newJobId, uploadUrl } = await backendApi.importJobs.create(file.name);

            // Upload to S3
            const s3Response = await fetch(uploadUrl, {
                method: "PUT",
                body: file,
                headers: { "Content-Type": file.type || "application/octet-stream" },
            });

            if (!s3Response.ok) {
                throw new Error("Failed to upload file to storage");
            }

            // Notify backend
            await backendApi.importJobs.notifyUploadComplete(newJobId);

            // Poll for parsing to complete
            let parsed = false;
            let attempts = 0;
            while (!parsed && attempts < 60) {
                attempts++;
                await new Promise((r) => setTimeout(r, 1000));
                try {
                    const jobData = await backendApi.importJobs.get(newJobId) as ImportJob;
                    if (jobData.fieldMapping?.headers && jobData.fieldMapping.headers.length > 0) {
                        parsed = true;
                        setJobId(newJobId);
                        setHighestCompletedStep(0); // Upload complete
                        setCurrentStep("mapping");
                        addNotification(t("import.upload.success", { count: jobData.totalRows }), "success");
                    } else if (jobData.status === "FAILED") {
                        throw new Error(jobData.errorMessage || "Parsing failed");
                    }
                } catch (pollError) {
                    console.warn("Polling error:", pollError);
                }
            }

            if (!parsed) {
                throw new Error("File parsing timed out");
            }
        } catch (err) {
            console.error("Upload error:", err);
            addNotification((err as Error).message || t("import.upload.error.uploadFailed"), "error");
        } finally {
            setIsUploading(false);
        }
    }, [addNotification]);

    // ========================================================================
    // MAPPING & VALIDATION HANDLER
    // ========================================================================

    const handleSaveMapping = useCallback(async () => {
        if (!jobId) return;

        // Validate required mappings
        const mappedFields = Object.values(fieldMapping).filter(Boolean);
        if (!mappedFields.includes("first_name")) {
            addNotification(t("import.mapping.error.firstNameRequired"), "error");
            return;
        }
        if (!mappedFields.includes("phone_number") && !mappedFields.includes("email")) {
            addNotification(t("import.mapping.error.phoneOrEmailRequired"), "error");
            return;
        }

        setIsProcessing(true);
        try {
            await backendApi.importJobs.saveMapping(jobId, { mapping: fieldMapping });
            await backendApi.importJobs.triggerValidation(jobId);

            setHighestCompletedStep(1); // Mapping complete
            setCurrentStep("review");
            setPreviewPage(0);

            // The job will now have status VALIDATING, and polling will show progress
            await mutateJob();
        } catch (err) {
            console.error("Mapping error:", err);
            addNotification(t("import.mapping.error.saveFailed"), "error");
        } finally {
            setIsProcessing(false);
        }
    }, [jobId, fieldMapping, addNotification, mutateJob]);

    // ========================================================================
    // COMMIT IMPORT HANDLER
    // ========================================================================

    const handleCommitImport = useCallback(async () => {
        if (!jobId) return;

        setIsProcessing(true);
        try {
            await backendApi.importJobs.commit(jobId);
            setHighestCompletedStep(2); // Review complete
            setCurrentStep("import");
            addNotification("Import started", "success");
        } catch (err) {
            console.error("Import error:", err);
            addNotification(t("import.progress.failed"), "error");
        } finally {
            setIsProcessing(false);
        }
    }, [jobId, addNotification]);

    // ========================================================================
    // COMPUTED VALUES FOR VALIDATION PROGRESS
    // ========================================================================

    const validationProgress = useMemo(() => {
        if (!job || job.status !== "VALIDATING") return null;
        const processed = (job.validRows || 0) + (job.invalidRows || 0) + (job.duplicateRows || 0);
        const total = job.totalRows || 1;
        return {
            processed,
            total,
            percentage: Math.round((processed / total) * 100),
        };
    }, [job]);

    const validContactCount = useMemo(() => {
        return job?.validRows ?? preview?.validCount ?? 0;
    }, [job?.validRows, preview?.validCount]);

    // ========================================================================
    // RENDER
    // ========================================================================

    return (
        <div className="flex-1 space-y-6 p-4 md:p-8">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => router.push(`/${locale}/dashboard/contacts`)}
                >
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <div>
                    <h1 className="text-2xl font-bold">{t("import.title")}</h1>
                    <p className="text-muted-foreground">
                        {t("import.upload.description")}
                    </p>
                </div>
            </div>

            {/* Stepper */}
            <div className="flex items-center justify-between max-w-3xl mx-auto">
                {STEP_CONFIG.map((step, idx) => {
                    const isCompleted = idx <= highestCompletedStep;
                    const isCurrent = idx === currentStepIndex;
                    const isClickable = canNavigateToStep(idx);
                    const Icon = step.icon;

                    return (
                        <div key={step.id} className="flex items-center">
                            <div className="flex flex-col items-center">
                                <button
                                    type="button"
                                    onClick={() => handleStepClick(idx)}
                                    disabled={!isClickable}
                                    className={`
                                        flex items-center justify-center w-12 h-12 rounded-full border-2 
                                        transition-all duration-200
                                        ${isCompleted && !isCurrent
                                            ? "bg-primary border-primary text-primary-foreground cursor-pointer hover:bg-primary/90"
                                            : isCurrent
                                                ? "border-primary text-primary bg-primary/10"
                                                : "border-muted text-muted-foreground"
                                        }
                                        ${isClickable && !isCurrent ? "cursor-pointer" : "cursor-default"}
                                        ${!isClickable && !isCurrent ? "opacity-50" : ""}
                                    `}
                                >
                                    {isCompleted && !isCurrent ? (
                                        <Check className="h-5 w-5" />
                                    ) : (
                                        <Icon className="h-5 w-5" />
                                    )}
                                </button>
                                <span className={`text-xs mt-2 font-medium ${isCurrent ? "text-primary" : isCompleted ? "text-foreground" : "text-muted-foreground"
                                    }`}>
                                    {t(`import.steps.${step.id}`)}
                                </span>
                            </div>
                            {idx < STEP_CONFIG.length - 1 && (
                                <div
                                    className={`h-0.5 w-12 md:w-20 mx-2 mt-[-1rem] ${idx < currentStepIndex ? "bg-primary" : "bg-muted"
                                        }`}
                                />
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Step Content */}
            <Card className="max-w-4xl mx-auto">
                {/* STEP 1: Upload */}
                {currentStep === "upload" && (
                    <>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Upload className="h-5 w-5" />
                                {t("import.upload.title")}
                            </CardTitle>
                            <CardDescription>
                                {t("import.upload.description")}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div
                                className="border-2 border-dashed rounded-lg p-12 text-center cursor-pointer hover:border-primary/50 transition-colors"
                                onClick={() => document.getElementById("file-input")?.click()}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    const file = e.dataTransfer.files[0];
                                    if (file) handleFileUpload(file);
                                }}
                                onDragOver={(e) => e.preventDefault()}
                            >
                                <input
                                    id="file-input"
                                    type="file"
                                    accept=".csv,.xlsx,.xls"
                                    className="hidden"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) handleFileUpload(file);
                                    }}
                                />
                                {isUploading ? (
                                    <Loader2 className="h-12 w-12 mx-auto text-primary animate-spin" />
                                ) : (
                                    <FileSpreadsheet className="h-12 w-12 mx-auto text-muted-foreground" />
                                )}
                                <p className="mt-4 text-lg font-medium">
                                    {isUploading ? t("import.upload.dropZone.isUploading") : t("import.upload.dropZone.active")}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    Supports CSV, XLSX, XLS
                                </p>
                            </div>
                        </CardContent>
                    </>
                )}

                {/* STEP 2: Mapping */}
                {currentStep === "mapping" && job && (
                    <>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <MapPin className="h-5 w-5" />
                                {t("import.mapping.title")}
                            </CardTitle>
                            <CardDescription>
                                {t("import.mapping.description")}
                                {job.totalRows > 0 && ` ${t("import.upload.success", { count: job.totalRows })}`}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {(job.fieldMapping as FieldMappingData)?.headers?.map((header) => (
                                <div key={header} className="flex items-center gap-4">
                                    <div className="w-48 font-medium truncate">{header}</div>
                                    <span className="text-muted-foreground">→</span>
                                    <select
                                        className="flex-1 border rounded-md px-3 py-2 bg-background"
                                        value={fieldMapping[header] || ""}
                                        onChange={(e) =>
                                            setFieldMapping({
                                                ...fieldMapping,
                                                [header]: e.target.value || null,
                                            })
                                        }
                                    >
                                        <option value="">{t("import.mapping.skipColumn")}</option>
                                        {INTERNAL_FIELDS.map((f) => {
                                            const fieldKey = f.key.replace(/_([a-z])/g, g => g[1].toUpperCase());
                                            return (
                                                <option key={f.key} value={f.key}>
                                                    {t(`fields.${fieldKey}`)} {f.required && `(${t("import.mapping.required")})`}
                                                </option>
                                            );
                                        })}
                                    </select>
                                </div>
                            ))}

                            <div className="flex justify-end gap-3 pt-4">
                                <Button
                                    variant="outline"
                                    onClick={() => setCurrentStep("upload")}
                                >
                                    {t("import.actions.back")}
                                </Button>
                                <Button onClick={handleSaveMapping} disabled={isProcessing}>
                                    {isProcessing && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                                    {t("import.actions.continueReview")}
                                </Button>
                            </div>
                        </CardContent>
                    </>
                )}

                {/* STEP 3: Review */}
                {currentStep === "review" && job && (
                    <>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Eye className="h-5 w-5" />
                                {t("import.review.title")}
                            </CardTitle>
                            <CardDescription>
                                {job.status === "VALIDATING"
                                    ? t("import.review.validating")
                                    : t("import.review.description")
                                }
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* Validation Progress */}
                            {job.status === "VALIDATING" && validationProgress && (
                                <div className="space-y-3 py-8">
                                    <div className="flex items-center justify-center gap-2 text-lg">
                                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                                        <span>{t("import.review.validating")}</span>
                                    </div>
                                    <Progress value={validationProgress.percentage} className="h-3" />
                                    <div className="text-center text-sm text-muted-foreground">
                                        {validationProgress.processed.toLocaleString()} / {validationProgress.total.toLocaleString()} {t("import.review.table.row")}
                                        ({validationProgress.percentage}%)
                                    </div>
                                    <div className="flex justify-center gap-4 text-sm">
                                        <span className="text-green-600">✓ {t("import.review.table.valid")}: {job.validRows || 0}</span>
                                        <span className="text-red-600">✗ {t("import.review.table.invalid")}: {job.invalidRows || 0}</span>
                                        <span className="text-yellow-600">⚠ {t("import.review.table.duplicate")}: {job.duplicateRows || 0}</span>
                                    </div>
                                </div>
                            )}

                            {/* Validated Results */}
                            {job.status === "VALIDATED" && (
                                <>
                                    {/* Status badges */}
                                    <div className="flex gap-4 flex-wrap">
                                        <Badge variant="default" className="text-sm">
                                            ✓ {t("import.review.table.valid")}: {job.validRows ?? 0}
                                        </Badge>
                                        <Badge variant="destructive" className="text-sm">
                                            ✗ {t("import.review.table.invalid")}: {job.invalidRows ?? 0}
                                        </Badge>
                                        <Badge variant="secondary" className="text-sm">
                                            ⚠ {t("import.review.table.duplicate")}: {job.duplicateRows ?? 0}
                                        </Badge>
                                    </div>

                                    {/* Preview table with tooltips */}
                                    <TooltipProvider>
                                        {preview && preview.rows.length > 0 && (
                                            <div className="border rounded-lg overflow-auto max-h-96">
                                                <table className="w-full text-sm">
                                                    <thead className="bg-muted sticky top-0">
                                                        <tr>
                                                            <th className="px-3 py-2 text-left w-16">{t("import.review.table.row")}</th>
                                                            <th className="px-3 py-2 text-left w-24">{t("import.review.table.status")}</th>
                                                            <th className="px-3 py-2 text-left">{t("import.review.table.data")}</th>
                                                            <th className="px-3 py-2 text-left w-48">{t("import.review.table.errors")}</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {preview.rows.map((row) => {
                                                            const dataEntries = row.mappedData
                                                                ? Object.entries(row.mappedData).filter(([, v]) => v)
                                                                : [];
                                                            const shortData = dataEntries
                                                                .slice(0, 3)
                                                                .map(([k, v]) => `${k.replace('_', ' ')}: ${v}`)
                                                                .join(" • ");
                                                            const fullData = dataEntries
                                                                .map(([k, v]) => `${k.replace('_', ' ')}: ${v}`)
                                                                .join("\n");

                                                            return (
                                                                <tr key={row.id} className="border-t hover:bg-muted/50">
                                                                    <td className="px-3 py-2">{row.rowNumber}</td>
                                                                    <td className="px-3 py-2">
                                                                        <Badge
                                                                            variant={
                                                                                row.status === "VALID"
                                                                                    ? "default"
                                                                                    : row.status === "INVALID"
                                                                                        ? "destructive"
                                                                                        : "secondary"
                                                                            }
                                                                        >
                                                                            {row.status}
                                                                        </Badge>
                                                                    </td>
                                                                    <td className="px-3 py-2">
                                                                        <Tooltip>
                                                                            <TooltipTrigger asChild>
                                                                                <span className="cursor-help truncate block max-w-md">
                                                                                    {shortData || "-"}
                                                                                </span>
                                                                            </TooltipTrigger>
                                                                            <TooltipContent side="bottom" className="max-w-sm whitespace-pre-wrap text-left">
                                                                                {fullData || "No data"}
                                                                            </TooltipContent>
                                                                        </Tooltip>
                                                                    </td>
                                                                    <td className="px-3 py-2 text-red-500 text-xs">
                                                                        {row.validationErrors
                                                                            ?.map((e) => e.message)
                                                                            .join(", ") || "-"}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </TooltipProvider>

                                    {/* Pagination */}
                                    {preview && preview.total > PAGE_SIZE && (
                                        <div className="flex items-center justify-between pt-2">
                                            <span className="text-sm text-muted-foreground">
                                                {t("pagination.page", {
                                                    current: previewPage + 1,
                                                    total: Math.ceil(preview.total / PAGE_SIZE)
                                                })}
                                            </span>
                                            <div className="flex gap-2">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => setPreviewPage(p => Math.max(0, p - 1))}
                                                    disabled={previewPage === 0}
                                                >
                                                    <ChevronLeft className="h-4 w-4" />
                                                    {t("pagination.previous")}
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => setPreviewPage(p => p + 1)}
                                                    disabled={(previewPage + 1) * PAGE_SIZE >= preview.total}
                                                >
                                                    {t("pagination.next")}
                                                    <ChevronRight className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Actions */}
                                    <div className="flex justify-end gap-3 pt-4">
                                        <Button
                                            variant="outline"
                                            onClick={() => setCurrentStep("mapping")}
                                        >
                                            {t("import.actions.back")}
                                        </Button>
                                        <Button
                                            onClick={handleCommitImport}
                                            disabled={isProcessing || validContactCount === 0}
                                        >
                                            {isProcessing && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                                            {t("import.actions.import", { count: validContactCount })}
                                        </Button>
                                    </div>
                                </>
                            )}
                        </CardContent>
                    </>
                )}

                {/* STEP 4: Import Progress */}
                {currentStep === "import" && job && (
                    <>
                        <CardHeader>
                            <CardTitle>{t("import.progress.title")}</CardTitle>
                            <CardDescription>
                                {job.status === "IMPORTED"
                                    ? t("import.progress.success")
                                    : job.status === "FAILED"
                                        ? t("import.progress.failed")
                                        : t("import.progress.description")
                                }
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <Progress
                                value={
                                    job.status === "IMPORTED"
                                        ? 100
                                        : job.status === "PROCESSING"
                                            ? 50
                                            : 25
                                }
                            />

                            <div className="text-center text-lg font-medium">
                                {job.status === "IMPORTED" ? (
                                    <span className="text-green-600">
                                        ✓ {t("import.progress.completeDescription", { valid: job.validRows, invalid: job.invalidRows })}
                                    </span>
                                ) : job.status === "FAILED" ? (
                                    <span className="text-red-600">
                                        ✗ {t("import.progress.failedDescription")}: {job.errorMessage || t("error")}
                                    </span>
                                ) : (
                                    <span className="flex items-center justify-center gap-2">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Processing...
                                    </span>
                                )}
                            </div>

                            {(job.status === "IMPORTED" || job.status === "FAILED") && (
                                <div className="flex justify-center pt-4">
                                    <Button
                                        onClick={() => router.push(`/${locale}/dashboard/contacts`)}
                                    >
                                        {t("import.actions.goToContacts")}
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                    </>
                )}
            </Card>
        </div>
    );
}
