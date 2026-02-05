/**
 * CatalogBulkImportModal
 *
 * Modal for bulk importing catalog items from CSV/Excel files
 *
 * Features:
 * - Drag and drop file upload
 * - CSV/Excel parsing
 * - Data preview and validation
 * - Column mapping
 * - Import progress and results
 */

"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { backendApi } from "@/lib/api/endpoints";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Papa from "papaparse";
import { useCallback, useState } from "react";

interface CatalogBulkImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface ParsedItem {
  name: string;
  description?: string;
  price: number;
  salePrice?: number;
  currency?: string;
  link?: string;
  retailerId?: string;
  availability?: string;
  condition?: string;
  brand?: string;
  imageUrl?: string;
}

interface ImportError {
  row: number;
  name: string;
  error: string;
}

type ImportStep = "upload" | "preview" | "importing" | "results";

// Expected column headers (case-insensitive) for Meta Commerce catalog fields
const COLUMN_MAPPING: Record<string, keyof ParsedItem> = {
  name: "name",
  product_name: "name",
  productname: "name",
  title: "name",
  description: "description",
  desc: "description",
  price: "price",
  sale_price: "salePrice",
  saleprice: "salePrice",
  currency: "currency",
  link: "link",
  url: "link",
  product_url: "link",
  sku: "retailerId",
  retailer_id: "retailerId",
  retailerid: "retailerId",
  product_id: "retailerId",
  id: "retailerId",
  availability: "availability",
  stock_status: "availability",
  condition: "condition",
  brand: "brand",
  image: "imageUrl",
  image_url: "imageUrl",
  imageurl: "imageUrl",
  main_image: "imageUrl",
  image_link: "imageUrl",
};

export function CatalogBulkImportModal({
  open,
  onOpenChange,
  onSuccess,
}: CatalogBulkImportModalProps) {
  const t = useTranslations("catalog.bulkImport");
  const tCommon = useTranslations("common");

  // State
  const [step, setStep] = useState<ImportStep>("upload");
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string>("");
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResult, setImportResult] = useState<{
    successCount: number;
    failedCount: number;
    totalCount: number;
    errors: ImportError[];
    createdItemIds: string[];
  } | null>(null);

  // Reset state when modal closes
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setStep("upload");
      setFileName("");
      setParsedItems([]);
      setParseErrors([]);
      setIsImporting(false);
      setImportProgress(0);
      setImportResult(null);
    }
    onOpenChange(isOpen);
  };

  // Parse CSV file
  const parseFile = useCallback((file: File) => {
    setFileName(file.name);
    setParseErrors([]);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) =>
        header.toLowerCase().trim().replace(/\s+/g, "_"),
      complete: (results) => {
        const items: ParsedItem[] = [];
        const errors: string[] = [];

        // Check if we have data
        if (!results.data || results.data.length === 0) {
          errors.push("No data found in file");
          setParseErrors(errors);
          return;
        }

        // Check for required name column
        const headers = Object.keys(results.data[0] as object);
        const hasNameColumn = headers.some(
          (h) => COLUMN_MAPPING[h.toLowerCase()] === "name",
        );
        if (!hasNameColumn) {
          errors.push(
            "Required column 'name' not found. Expected columns: name, description, price, link, currency, etc.",
          );
          setParseErrors(errors);
          return;
        }

        // Parse each row
        (results.data as Record<string, string>[]).forEach((row, index) => {
          try {
            const item: Partial<ParsedItem> = {};

            // Map columns to item properties
            Object.entries(row).forEach(([key, value]) => {
              const normalizedKey = key
                .toLowerCase()
                .trim()
                .replace(/\s+/g, "_");
              const mappedKey = COLUMN_MAPPING[normalizedKey];

              if (mappedKey && value) {
                const trimmedValue = value.trim();

                switch (mappedKey) {
                  case "price":
                  case "salePrice":
                    const numValue = parseFloat(
                      trimmedValue.replace(/[^0-9.]/g, ""),
                    );
                    if (!isNaN(numValue)) {
                      item[mappedKey] = numValue;
                    }
                    break;
                  default:
                    (item as any)[mappedKey] = trimmedValue;
                }
              }
            });

            // Validate required fields
            if (!item.name || item.name.trim().length === 0) {
              errors.push(`Row ${index + 2}: Missing product name`);
              return;
            }

            if (typeof item.price !== "number" || item.price < 0) {
              errors.push(`Row ${index + 2}: Invalid or missing price`);
              return;
            }

            items.push(item as ParsedItem);
          } catch (error) {
            errors.push(`Row ${index + 2}: ${error}`);
          }
        });

        // Limit to 500 items
        if (items.length > 500) {
          errors.push(
            `Only first 500 items will be imported (${items.length} found)`,
          );
          setParsedItems(items.slice(0, 500));
        } else {
          setParsedItems(items);
        }

        setParseErrors(errors);

        if (items.length > 0) {
          setStep("preview");
        }
      },
      error: (error) => {
        setParseErrors([`Failed to parse file: ${error.message}`]);
      },
    });
  }, []);

  // Handle file drop
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const file = e.dataTransfer.files[0];
      if (file) {
        if (
          file.type === "text/csv" ||
          file.name.endsWith(".csv") ||
          file.type ===
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
          file.name.endsWith(".xlsx")
        ) {
          parseFile(file);
        } else {
          setParseErrors(["Please upload a CSV file"]);
        }
      }
    },
    [parseFile],
  );

  // Handle file input change
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      parseFile(file);
    }
  };

  // Perform import
  const handleImport = async () => {
    if (parsedItems.length === 0) return;

    setIsImporting(true);
    setStep("importing");
    setImportProgress(10);

    try {
      // Simulate progress
      const progressInterval = setInterval(() => {
        setImportProgress((prev) => Math.min(prev + 10, 90));
      }, 500);

      const result = await backendApi.catalog.bulkImport(parsedItems);

      clearInterval(progressInterval);
      setImportProgress(100);
      setImportResult(result);
      setStep("results");

      if (result.successCount > 0) {
        onSuccess();
      }
    } catch (error) {
      console.error("Import failed:", error);
      setImportResult({
        successCount: 0,
        failedCount: parsedItems.length,
        totalCount: parsedItems.length,
        errors: [{ row: 0, name: "All items", error: String(error) }],
        createdItemIds: [],
      });
      setStep("results");
    } finally {
      setIsImporting(false);
    }
  };

  // Download template
  const downloadTemplate = () => {
    const template = `name,description,price,sale_price,currency,link,sku,availability,condition,brand,image_url
"Sample Product 1","A great product description",29.99,24.99,USD,https://example.com/product1,SKU001,in_stock,new,"Brand Name",https://example.com/image1.jpg
"Sample Product 2","Another product",49.99,,USD,https://example.com/product2,SKU002,in_stock,new,,https://example.com/image2.jpg`;

    const blob = new Blob([template], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "catalog-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // Format price for display
  const formatPrice = (price?: number) => {
    if (typeof price !== "number") return "-";
    return `$${price.toFixed(2)}`;
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            {t("title")}
          </DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-hidden">
          {/* Upload Step */}
          {step === "upload" && (
            <div className="space-y-4">
              {/* Download template */}
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={downloadTemplate}>
                  <Download className="mr-2 h-4 w-4" />
                  {t("download")}
                </Button>
              </div>

              {/* Drop zone */}
              <div
                className={cn(
                  "border-2 border-dashed rounded-lg p-12 text-center transition-colors",
                  isDragging
                    ? "border-primary bg-primary/5"
                    : "border-muted-foreground/25 hover:border-muted-foreground/50",
                )}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
              >
                <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-lg font-medium mb-2">
                  Drag & drop your CSV file here
                </p>
                <p className="text-muted-foreground mb-4">or</p>
                <label>
                  <Button variant="secondary" asChild>
                    <span>
                      Browse Files
                      <input
                        type="file"
                        className="hidden"
                        accept=".csv,.xlsx"
                        onChange={handleFileChange}
                      />
                    </span>
                  </Button>
                </label>
                <p className="text-xs text-muted-foreground mt-4">
                  {t("maxRows", { max: 500 })}
                </p>
              </div>

              {/* Parse errors */}
              {parseErrors.length > 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Parsing Issues</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc list-inside">
                      {parseErrors.map((error, i) => (
                        <li key={i}>{error}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {/* Preview Step */}
          {step === "preview" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{fileName}</span>
                  <Badge variant="secondary">{parsedItems.length} items</Badge>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setStep("upload");
                    setParsedItems([]);
                    setFileName("");
                  }}
                >
                  <X className="mr-1 h-4 w-4" />
                  Change file
                </Button>
              </div>

              {parseErrors.length > 0 && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Warnings</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc list-inside text-sm">
                      {parseErrors.slice(0, 5).map((error, i) => (
                        <li key={i}>{error}</li>
                      ))}
                      {parseErrors.length > 5 && (
                        <li>...and {parseErrors.length - 5} more warnings</li>
                      )}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              <ScrollArea className="h-[300px] border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Sale Price</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Brand</TableHead>
                      <TableHead>Availability</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedItems.slice(0, 50).map((item, index) => (
                      <TableRow key={index}>
                        <TableCell className="text-muted-foreground">
                          {index + 1}
                        </TableCell>
                        <TableCell className="font-medium max-w-[200px] truncate">
                          {item.name}
                        </TableCell>
                        <TableCell>{formatPrice(item.price)}</TableCell>
                        <TableCell>{formatPrice(item.salePrice)}</TableCell>
                        <TableCell>{item.retailerId || "-"}</TableCell>
                        <TableCell>{item.brand || "-"}</TableCell>
                        <TableCell>{item.availability || "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {parsedItems.length > 50 && (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    Showing 50 of {parsedItems.length} items
                  </div>
                )}
              </ScrollArea>
            </div>
          )}

          {/* Importing Step */}
          {step === "importing" && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
              <p className="text-lg font-medium mb-4">{t("processing")}</p>
              <Progress value={importProgress} className="w-64" />
              <p className="text-sm text-muted-foreground mt-2">
                {importProgress}% complete
              </p>
            </div>
          )}

          {/* Results Step */}
          {step === "results" && importResult && (
            <div className="space-y-4">
              {importResult.successCount > 0 ? (
                <Alert>
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <AlertTitle>Import Complete</AlertTitle>
                  <AlertDescription>
                    {t("success", { count: importResult.successCount })}
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert variant="destructive">
                  <XCircle className="h-4 w-4" />
                  <AlertTitle>Import Failed</AlertTitle>
                  <AlertDescription>
                    {t("failed", { error: "No items were imported" })}
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 bg-muted rounded-lg text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {importResult.successCount}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Successful
                  </div>
                </div>
                <div className="p-4 bg-muted rounded-lg text-center">
                  <div className="text-2xl font-bold text-red-600">
                    {importResult.failedCount}
                  </div>
                  <div className="text-sm text-muted-foreground">Failed</div>
                </div>
                <div className="p-4 bg-muted rounded-lg text-center">
                  <div className="text-2xl font-bold">
                    {importResult.totalCount}
                  </div>
                  <div className="text-sm text-muted-foreground">Total</div>
                </div>
              </div>

              {importResult.errors.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Errors</h4>
                  <ScrollArea className="h-[150px] border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-16">Row</TableHead>
                          <TableHead>Item</TableHead>
                          <TableHead>Error</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {importResult.errors.map((err, index) => (
                          <TableRow key={index}>
                            <TableCell>{err.row}</TableCell>
                            <TableCell className="max-w-[150px] truncate">
                              {err.name}
                            </TableCell>
                            <TableCell className="text-red-600">
                              {err.error}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between gap-2">
          {step === "upload" && (
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              {tCommon("cancel")}
            </Button>
          )}

          {step === "preview" && (
            <>
              <Button variant="outline" onClick={() => setStep("upload")}>
                Back
              </Button>
              <Button
                onClick={handleImport}
                disabled={parsedItems.length === 0}
              >
                <Upload className="mr-2 h-4 w-4" />
                Import {parsedItems.length} items
              </Button>
            </>
          )}

          {step === "results" && (
            <Button onClick={() => handleOpenChange(false)}>
              {tCommon("close")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
