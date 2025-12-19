"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  TemplateApprovalResult,
  TemplateValidationResult,
  ValidationError,
} from "@/lib/api/endpoints";
import { backendApi } from "@/lib/api/endpoints";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Loader2,
  Send,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

interface RequestApprovalModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (result: TemplateApprovalResult) => void;
  templateId: string;
  locale: string;
  templateName: string;
}

type ModalStep = "validating" | "errors" | "confirm" | "submitting" | "result";

export function RequestApprovalModal({
  open,
  onOpenChange,
  onSuccess,
  templateId,
  locale,
  templateName,
}: RequestApprovalModalProps) {
  const t = useTranslations("templates.approval.modal");
  const tCommon = useTranslations("common");

  const [step, setStep] = useState<ModalStep>("validating");
  const [validationResult, setValidationResult] =
    useState<TemplateValidationResult | null>(null);
  const [approvalResult, setApprovalResult] =
    useState<TemplateApprovalResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Run validation when modal opens
  useEffect(() => {
    if (open) {
      runValidation();
    } else {
      // Reset state when modal closes
      setStep("validating");
      setValidationResult(null);
      setApprovalResult(null);
      setError(null);
    }
  }, [open, templateId, locale]);

  const runValidation = async () => {
    setStep("validating");
    setError(null);

    try {
      const result = await backendApi.templates.validateForApproval(
        templateId,
        {
          locale,
        }
      );
      setValidationResult(result);

      if (!result.canSubmit) {
        setStep("errors");
      } else {
        setStep("confirm");
      }
    } catch (err: any) {
      setError(err.message || "Failed to validate template");
      setStep("errors");
    }
  };

  const handleSubmit = async () => {
    setStep("submitting");
    setError(null);

    try {
      const result = await backendApi.templates.requestApproval(templateId, {
        locale,
        provider: "meta",
      });
      setApprovalResult(result);
      setStep("result");

      if (result.success) {
        onSuccess?.(result);
      }
    } catch (err: any) {
      setError(err.message || "Failed to submit template for approval");
      setStep("result");
    }
  };

  const renderValidatingStep = () => (
    <div className="flex flex-col items-center justify-center py-8">
      <Loader2 className="h-8 w-8 animate-spin text-blue-500 mb-4" />
      <p className="text-sm text-muted-foreground">{t("validating")}</p>
      <p className="text-xs text-muted-foreground/70 mt-1">
        {t("validatingDescription")}
      </p>
    </div>
  );

  const renderErrorsStep = () => (
    <div className="space-y-4">
      <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-950/50 rounded-lg border border-red-200 dark:border-red-800">
        <AlertCircle className="h-5 w-5 text-red-500 dark:text-red-400 mt-0.5 flex-shrink-0" />
        <div>
          <h4 className="font-medium text-red-800 dark:text-red-300">
            {t("errorsFound")}
          </h4>
          <p className="text-sm text-red-600 dark:text-red-400 mt-1">
            {t("errorsFoundDescription")}
          </p>
        </div>
      </div>

      {validationResult && (
        <ValidationErrorsList
          errors={validationResult.errors}
          warnings={validationResult.warnings}
          t={t}
        />
      )}

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-950/50 rounded-lg border border-red-200 dark:border-red-800">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}
    </div>
  );

  const renderConfirmStep = () => (
    <div className="space-y-4">
      <div className="flex items-start gap-3 p-4 bg-green-50 dark:bg-green-950/50 rounded-lg border border-green-200 dark:border-green-800">
        <CheckCircle className="h-5 w-5 text-green-500 dark:text-green-400 mt-0.5 flex-shrink-0" />
        <div>
          <h4 className="font-medium text-green-800 dark:text-green-300">
            {t("readyToSubmit")}
          </h4>
          <p className="text-sm text-green-600 dark:text-green-400 mt-1">
            {t("readyDescription")}
          </p>
        </div>
      </div>

      <div className="bg-muted rounded-lg p-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Template:</span>
          <span className="font-medium text-foreground">{templateName}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Provider:</span>
          <span className="font-medium text-foreground">Meta Cloud API</span>
        </div>
      </div>

      {validationResult?.warnings && validationResult.warnings.length > 0 && (
        <ValidationErrorsList
          errors={[]}
          warnings={validationResult.warnings}
          t={t}
        />
      )}

      <div className="p-3 bg-amber-50 dark:bg-amber-950/50 rounded-lg border border-amber-200 dark:border-amber-800">
        <p className="text-xs text-amber-700 dark:text-amber-300">
          {t("metaWarning")}
        </p>
      </div>
    </div>
  );

  const renderSubmittingStep = () => (
    <div className="flex flex-col items-center justify-center py-8">
      <Loader2 className="h-8 w-8 animate-spin text-blue-500 mb-4" />
      <p className="text-sm text-muted-foreground">{t("submitting")}</p>
      <p className="text-xs text-muted-foreground/70 mt-1">
        {t("submittingDescription")}
      </p>
    </div>
  );

  const renderResultStep = () => (
    <div className="space-y-4">
      {approvalResult?.success ? (
        <div className="flex flex-col items-center justify-center py-4">
          <CheckCircle className="h-12 w-12 text-green-500 dark:text-green-400 mb-4" />
          <h4 className="font-medium text-green-800 dark:text-green-300 text-lg">
            {t("submitted")}
          </h4>
          <p className="text-sm text-muted-foreground mt-2 text-center">
            {t("submittedDescription")}
          </p>
          {approvalResult.metaTemplateId && (
            <p className="text-xs text-muted-foreground/70 mt-2">
              Template ID: {approvalResult.metaTemplateId}
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-4">
          <AlertCircle className="h-12 w-12 text-red-500 dark:text-red-400 mb-4" />
          <h4 className="font-medium text-red-800 dark:text-red-300 text-lg">
            {t("failed")}
          </h4>
          <p className="text-sm text-muted-foreground mt-2 text-center">
            {error || approvalResult?.message || t("failedDescription")}
          </p>
        </div>
      )}

      {approvalResult?.validationErrors &&
        approvalResult.validationErrors.length > 0 && (
          <ValidationErrorsList
            errors={approvalResult.validationErrors.filter(
              (e) => e.severity === "error"
            )}
            warnings={approvalResult.validationErrors.filter(
              (e) => e.severity === "warning"
            )}
            t={t}
          />
        )}
    </div>
  );

  const renderContent = () => {
    switch (step) {
      case "validating":
        return renderValidatingStep();
      case "errors":
        return renderErrorsStep();
      case "confirm":
        return renderConfirmStep();
      case "submitting":
        return renderSubmittingStep();
      case "result":
        return renderResultStep();
    }
  };

  const renderFooter = () => {
    switch (step) {
      case "validating":
      case "submitting":
        return null;

      case "errors":
        return (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {tCommon("close")}
            </Button>
          </DialogFooter>
        );

      case "confirm":
        return (
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {tCommon("cancel")}
            </Button>
            <Button onClick={handleSubmit} className="gap-2">
              <Send className="h-4 w-4" />
              {t("confirmSubmit")}
            </Button>
          </DialogFooter>
        );

      case "result":
        return (
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>
              {approvalResult?.success ? tCommon("close") : t("close")}
            </Button>
          </DialogFooter>
        );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {step === "errors" ? t("errorsFoundDescription") : t("description")}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto">{renderContent()}</div>

        {renderFooter()}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Component to display validation errors and warnings
 */
function ValidationErrorsList({
  errors,
  warnings,
  t,
}: {
  errors: ValidationError[];
  warnings: ValidationError[];
  t: (key: string) => string;
}) {
  return (
    <div className="space-y-3">
      {errors.length > 0 && (
        <div className="space-y-2">
          <h5 className="text-sm font-medium text-red-800 dark:text-red-300 flex items-center gap-1">
            <AlertCircle className="h-4 w-4" />
            {t("errors")} ({errors.length})
          </h5>
          <ul className="space-y-1">
            {errors.map((error, index) => (
              <li
                key={index}
                className="text-sm text-red-600 dark:text-red-400 pl-5 before:content-['•'] before:absolute before:left-0 before:text-red-400 dark:before:text-red-500 relative"
              >
                <span className="font-medium">{error.field}:</span>{" "}
                {error.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="space-y-2">
          <h5 className="text-sm font-medium text-yellow-800 dark:text-yellow-300 flex items-center gap-1">
            <AlertTriangle className="h-4 w-4" />
            {t("warnings")} ({warnings.length})
          </h5>
          <ul className="space-y-1">
            {warnings.map((warning, index) => (
              <li
                key={index}
                className="text-sm text-yellow-600 dark:text-yellow-400 pl-5 before:content-['•'] before:absolute before:left-0 before:text-yellow-400 dark:before:text-yellow-500 relative"
              >
                <span className="font-medium">{warning.field}:</span>{" "}
                {warning.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
