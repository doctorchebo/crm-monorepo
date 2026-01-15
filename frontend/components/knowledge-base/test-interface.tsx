/**
 * Knowledge Base Test Interface Component
 *
 * Allows testing knowledge retrieval with sample queries and viewing results.
 */

"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  knowledgeBaseApi,
  type KbObjectTemplate,
  type RetrievalResult,
  type TestQueryResponse,
} from "@/lib/api/knowledge-base";
import {
  ArrowRight,
  Bot,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Database,
  FileText,
  Loader2,
  Search,
  Sparkles,
  User,
  Zap,
} from "lucide-react";
import { useState } from "react";
import useSWR from "swr";

interface QueryHistoryItem {
  query: string;
  timestamp: Date;
  resultCount: number;
  timing: number;
}

interface ResultCardProps {
  result: RetrievalResult;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
}

function ResultCard({ result, index, isExpanded, onToggle }: ResultCardProps) {
  return (
    <Card
      className={`transition-all ${isExpanded ? "ring-2 ring-primary" : ""}`}
    >
      <CardHeader className="cursor-pointer pb-3" onClick={onToggle}>
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-medium">
              {index + 1}
            </div>
            <div>
              <CardTitle className="text-base">{result.objectName}</CardTitle>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="text-xs">
                  {result.templateName}
                </Badge>
                <Badge
                  variant="secondary"
                  className={`text-xs ${result.score >= 0.8
                      ? "bg-green-500/10 text-green-700"
                      : result.score >= 0.6
                        ? "bg-yellow-500/10 text-yellow-700"
                        : "bg-gray-500/10 text-gray-700"
                    }`}
                >
                  {(result.score * 100).toFixed(1)}% match
                </Badge>
              </div>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>
      {isExpanded && (
        <CardContent className="pt-0 space-y-4">
          {/* Matched Content */}
          <div>
            <Label className="text-xs text-muted-foreground">
              Matched Content
            </Label>
            <div className="mt-1 p-3 bg-muted/50 rounded-md text-sm">
              {result.content || "No content preview available"}
            </div>
          </div>

          {/* Field Values */}
          {result.fieldValues && Object.keys(result.fieldValues).length > 0 && (
            <div>
              <Label className="text-xs text-muted-foreground">
                Field Values
              </Label>
              <div className="mt-1 grid gap-2">
                {Object.entries(result.fieldValues).map(([key, value]) => (
                  <div key={key} className="flex items-start gap-2 text-sm">
                    <span className="font-medium capitalize min-w-[120px]">
                      {key.replace(/_/g, " ")}:
                    </span>
                    <span className="text-muted-foreground">
                      {typeof value === "object"
                        ? JSON.stringify(value)
                        : String(value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Media */}
          {result.media && result.media.length > 0 && (
            <div>
              <Label className="text-xs text-muted-foreground">
                Attached Media ({result.media.length})
              </Label>
              <div className="mt-1 flex flex-wrap gap-2">
                {result.media.map((m) => (
                  <Badge key={m.id} variant="outline">
                    {m.mediaType}: {m.fileName}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

interface SimulatedChatProps {
  query: string;
  context: string;
}

function SimulatedChat({ query, context }: SimulatedChatProps) {
  const [showContext, setShowContext] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Bot className="h-4 w-4" />
          Simulated AI Response
        </CardTitle>
        <CardDescription>
          Preview how the AI would use the retrieved knowledge
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* User Message */}
        <div className="flex items-start gap-3">
          <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground">
            <User className="h-4 w-4" />
          </div>
          <div className="flex-1 p-3 bg-primary/10 rounded-lg rounded-tl-none">
            <p className="text-sm">{query}</p>
          </div>
        </div>

        {/* AI Response */}
        <div className="flex items-start gap-3">
          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="flex-1 space-y-2">
            <div className="p-3 bg-muted rounded-lg rounded-tl-none">
              <p className="text-sm italic text-muted-foreground">
                AI would generate a response using the retrieved knowledge
                context...
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-auto py-1 px-2 text-xs"
              onClick={() => setShowContext(!showContext)}
            >
              {showContext ? "Hide" : "Show"} Injected Context
            </Button>
            {showContext && (
              <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                <Label className="text-xs text-yellow-700 font-medium">
                  Context Injected into AI Prompt:
                </Label>
                <pre className="mt-2 text-xs whitespace-pre-wrap text-muted-foreground overflow-x-auto">
                  {context}
                </pre>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function TestInterface() {
  // Form state
  const [query, setQuery] = useState("");
  const [templateFilter, setTemplateFilter] = useState<string>("all");
  const [limit, setLimit] = useState(5);

  // Results state
  const [results, setResults] = useState<TestQueryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedResults, setExpandedResults] = useState<Set<number>>(
    new Set([0])
  );
  const [queryHistory, setQueryHistory] = useState<QueryHistoryItem[]>([]);

  // Fetch templates for filter
  const { data: templates } = useSWR<KbObjectTemplate[]>(
    "knowledge-base-templates",
    () => knowledgeBaseApi.listTemplates()
  );

  // Execute search
  const handleSearch = async () => {
    if (!query.trim()) return;

    setIsLoading(true);
    try {
      const response = await knowledgeBaseApi.testQuery({
        query: query.trim(),
        templateIds: templateFilter !== "all" ? [templateFilter] : undefined,
        limit,
      });
      // Ensure response structure is valid before setting state to prevent crashes
      const safeResponse = {
        ...response,
        results: response?.results || [],
        timing: response?.timing || { embeddingMs: 0, searchMs: 0, totalMs: 0 },
      };

      setResults(safeResponse);
      setExpandedResults(new Set([0]));

      // Add to history
      setQueryHistory((prev) => [
        {
          query: query.trim(),
          timestamp: new Date(),
          resultCount: safeResponse.results.length,
          timing: safeResponse.timing.totalMs,
        },
        ...prev.slice(0, 9),
      ]);
    } catch (error) {
      console.error("Search failed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleResultExpansion = (index: number) => {
    setExpandedResults((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const copyContext = () => {
    if (results?.generatedContext) {
      navigator.clipboard.writeText(results.generatedContext);
    }
  };

  // Sample queries for quick testing
  const sampleQueries = [
    "What properties do you have available in downtown?",
    "Tell me about your premium products",
    "What is your return policy?",
    "Do you have any 3 bedroom apartments?",
    "What services do you offer for businesses?",
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">Test Knowledge Retrieval</h1>
        <p className="text-muted-foreground">
          Test how the AI retrieves and uses your knowledge base content
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Query Panel */}
        <div className="lg:col-span-1 space-y-6">
          {/* Search Form */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Query</CardTitle>
              <CardDescription>
                Enter a question to test retrieval
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Your Question</Label>
                <Textarea
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="e.g., What properties do you have available?"
                  rows={3}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && e.ctrlKey) {
                      handleSearch();
                    }
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Press Ctrl+Enter to search
                </p>
              </div>

              <div className="space-y-2">
                <Label>Filter by Template</Label>
                <Select
                  value={templateFilter}
                  onValueChange={setTemplateFilter}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All templates" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Templates</SelectItem>
                    {templates?.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.displayName || t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Max Results</Label>
                <Select
                  value={String(limit)}
                  onValueChange={(v) => setLimit(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3">3 results</SelectItem>
                    <SelectItem value="5">5 results</SelectItem>
                    <SelectItem value="10">10 results</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                onClick={handleSearch}
                disabled={!query.trim() || isLoading}
                className="w-full"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Search className="h-4 w-4 mr-2" />
                )}
                Search
              </Button>
            </CardContent>
          </Card>

          {/* Sample Queries */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sample Queries</CardTitle>
              <CardDescription>Click to try a sample query</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {sampleQueries.map((sq, index) => (
                  <Button
                    key={index}
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-left h-auto py-2 px-3"
                    onClick={() => setQuery(sq)}
                  >
                    <ArrowRight className="h-3 w-3 mr-2 flex-shrink-0" />
                    <span className="truncate">{sq}</span>
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Query History */}
          {queryHistory.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent Queries</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[200px]">
                  <div className="space-y-2">
                    {queryHistory.map((item, index) => (
                      <div
                        key={index}
                        className="p-2 hover:bg-muted rounded cursor-pointer"
                        onClick={() => setQuery(item.query)}
                      >
                        <p className="text-sm truncate">{item.query}</p>
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                          <span>{item.resultCount} results</span>
                          <span>•</span>
                          <span>{item.timing}ms</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Results Panel */}
        <div className="lg:col-span-2 space-y-6">
          {/* Loading State */}
          {isLoading && (
            <Card>
              <CardContent className="py-8">
                <div className="flex flex-col items-center justify-center gap-4">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <div className="text-center">
                    <p className="font-medium">Searching knowledge base...</p>
                    <p className="text-sm text-muted-foreground">
                      Generating embeddings and finding relevant content
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Results */}
          {!isLoading && results && (
            <>
              {/* Timing Stats */}
              <Card>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-6">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">
                          <strong>{results.results.length}</strong> results
                          found
                        </span>
                      </div>
                      <Separator orientation="vertical" className="h-4" />
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">
                          <strong>{results.timing.totalMs}</strong>ms total
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>Embedding: {results.timing.embeddingMs}ms</span>
                        <span>Search: {results.timing.searchMs}ms</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* No Results */}
              {results.results.length === 0 && (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Database className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium">No Results Found</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Try a different query or check that you have published
                      objects
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Result Cards */}
              {results.results.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-medium">Retrieved Objects</h2>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (expandedResults.size === results.results.length) {
                          setExpandedResults(new Set());
                        } else {
                          setExpandedResults(
                            new Set(results.results.map((_, i) => i))
                          );
                        }
                      }}
                    >
                      {expandedResults.size === results.results.length
                        ? "Collapse All"
                        : "Expand All"}
                    </Button>
                  </div>
                  {results.results.map((result, index) => (
                    <ResultCard
                      key={result.objectId}
                      result={result}
                      index={index}
                      isExpanded={expandedResults.has(index)}
                      onToggle={() => toggleResultExpansion(index)}
                    />
                  ))}
                </div>
              )}

              {/* Generated Context */}
              {results.generatedContext && (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <Zap className="h-4 w-4" />
                          Generated AI Context
                        </CardTitle>
                        <CardDescription>
                          This context would be injected into the AI prompt
                        </CardDescription>
                      </div>
                      <Button variant="outline" size="sm" onClick={copyContext}>
                        <Copy className="h-4 w-4 mr-2" />
                        Copy
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <pre className="p-4 bg-muted rounded-lg text-sm whitespace-pre-wrap overflow-x-auto max-h-[300px] overflow-y-auto">
                      {results.generatedContext}
                    </pre>
                  </CardContent>
                </Card>
              )}

              {/* Simulated Chat */}
              {results.results.length > 0 && results.generatedContext && (
                <SimulatedChat
                  query={query}
                  context={results.generatedContext}
                />
              )}
            </>
          )}

          {/* Empty State */}
          {!isLoading && !results && (
            <Card className="py-12">
              <CardContent className="flex flex-col items-center justify-center text-center">
                <Search className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">
                  Test Your Knowledge Base
                </h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-md">
                  Enter a query to see how the AI retrieves relevant information
                  from your published knowledge objects.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
