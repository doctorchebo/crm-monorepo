"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type {
  WorkflowNodeType,
  WorkflowWithDetails,
} from "@/lib/types/workflow.types";
import {
  AlertCircle,
  ArrowRightLeft,
  Bot,
  Clock,
  Filter,
  GitBranch,
  Mail,
  MessageSquare,
  Plus,
  Search,
  Settings,
  Tag,
  Target,
  User,
  Webhook,
  Zap,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

interface WorkflowSidebarProps {
  workflow: WorkflowWithDetails;
  onUpdate: (updates: Partial<WorkflowWithDetails>) => void;
}

interface NodeTypeDefinition {
  type: WorkflowNodeType;
  label: string;
  description: string;
  icon: React.ReactNode;
  category: "trigger" | "condition" | "action" | "flow";
  color: string;
}

const NODE_TYPES: NodeTypeDefinition[] = [
  // Triggers
  {
    type: "trigger_message",
    label: "Message Received",
    description: "Start when a message is received",
    icon: <MessageSquare className="h-4 w-4" />,
    category: "trigger",
    color: "#22c55e",
  },
  {
    type: "trigger_webhook",
    label: "Webhook",
    description: "Start from external webhook",
    icon: <Webhook className="h-4 w-4" />,
    category: "trigger",
    color: "#22c55e",
  },
  {
    type: "trigger_tag",
    label: "Tag Added",
    description: "Start when tag is added to contact",
    icon: <Tag className="h-4 w-4" />,
    category: "trigger",
    color: "#22c55e",
  },
  {
    type: "trigger_stage_enter",
    label: "Stage Changed",
    description: "Start when chat enters a stage",
    icon: <Target className="h-4 w-4" />,
    category: "trigger",
    color: "#22c55e",
  },

  // Conditions
  {
    type: "condition",
    label: "AI Classification",
    description: "Use AI to classify message intent",
    icon: <Bot className="h-4 w-4" />,
    category: "condition",
    color: "#f59e0b",
  },
  {
    type: "condition",
    label: "Keyword Match",
    description: "Check for specific keywords",
    icon: <Filter className="h-4 w-4" />,
    category: "condition",
    color: "#f59e0b",
  },
  {
    type: "condition",
    label: "Contact Field",
    description: "Check contact attribute value",
    icon: <User className="h-4 w-4" />,
    category: "condition",
    color: "#f59e0b",
  },
  {
    type: "condition",
    label: "Time Condition",
    description: "Check time of day or week",
    icon: <Clock className="h-4 w-4" />,
    category: "condition",
    color: "#f59e0b",
  },

  // Actions
  {
    type: "action",
    label: "Send Message",
    description: "Send a text or template message",
    icon: <MessageSquare className="h-4 w-4" />,
    category: "action",
    color: "#3b82f6",
  },
  {
    type: "action",
    label: "Move to Stage",
    description: "Move chat to another stage",
    icon: <ArrowRightLeft className="h-4 w-4" />,
    category: "action",
    color: "#3b82f6",
  },
  {
    type: "action",
    label: "Assign Agent",
    description: "Assign chat to a team member",
    icon: <User className="h-4 w-4" />,
    category: "action",
    color: "#3b82f6",
  },
  {
    type: "action",
    label: "Update AI Config",
    description: "Change AI instructions for this step",
    icon: <Bot className="h-4 w-4" />,
    category: "action",
    color: "#3b82f6",
  },
  {
    type: "action",
    label: "Send Email",
    description: "Send an email notification",
    icon: <Mail className="h-4 w-4" />,
    category: "action",
    color: "#3b82f6",
  },
  {
    type: "action",
    label: "HTTP Request",
    description: "Call an external API",
    icon: <Webhook className="h-4 w-4" />,
    category: "action",
    color: "#3b82f6",
  },
  {
    type: "action",
    label: "Request Handoff",
    description: "Request human agent handoff",
    icon: <AlertCircle className="h-4 w-4" />,
    category: "action",
    color: "#3b82f6",
  },

  // Flow Control
  {
    type: "delay",
    label: "Delay",
    description: "Wait for a specified time",
    icon: <Clock className="h-4 w-4" />,
    category: "flow",
    color: "#8b5cf6",
  },
  {
    type: "branch",
    label: "Branch",
    description: "Split into multiple paths",
    icon: <GitBranch className="h-4 w-4" />,
    category: "flow",
    color: "#8b5cf6",
  },
  {
    type: "sub_workflow",
    label: "Sub-Workflow",
    description: "Run another workflow",
    icon: <Zap className="h-4 w-4" />,
    category: "flow",
    color: "#8b5cf6",
  },
  {
    type: "end",
    label: "End",
    description: "End the workflow",
    icon: <Target className="h-4 w-4" />,
    category: "flow",
    color: "#ef4444",
  },
];

const CATEGORIES = {
  trigger: { label: "Triggers", icon: <Zap className="h-4 w-4" /> },
  condition: { label: "Conditions", icon: <Filter className="h-4 w-4" /> },
  action: { label: "Actions", icon: <MessageSquare className="h-4 w-4" /> },
  flow: { label: "Flow Control", icon: <GitBranch className="h-4 w-4" /> },
};

function NodeTypeCard({
  node,
  onDragStart,
}: {
  node: NodeTypeDefinition;
  onDragStart: (e: React.DragEvent, node: NodeTypeDefinition) => void;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, node)}
      className="flex items-center gap-3 p-2 rounded-lg border bg-card hover:bg-accent/50 cursor-grab active:cursor-grabbing transition-colors"
    >
      <div
        className="w-8 h-8 rounded-md flex items-center justify-center text-white"
        style={{ backgroundColor: node.color }}
      >
        {node.icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{node.label}</p>
        <p className="text-xs text-muted-foreground truncate">
          {node.description}
        </p>
      </div>
    </div>
  );
}

export function WorkflowSidebar({ workflow, onUpdate }: WorkflowSidebarProps) {
  const t = useTranslations("workflows.editor");
  const [search, setSearch] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<string[]>([
    "trigger",
    "condition",
    "action",
    "flow",
  ]);

  const handleDragStart = (e: React.DragEvent, node: NodeTypeDefinition) => {
    e.dataTransfer.setData(
      "application/workflow-node",
      JSON.stringify({
        type: node.type,
        label: node.label,
        color: node.color,
      }),
    );
    e.dataTransfer.effectAllowed = "copy";
  };

  const filteredNodes = search
    ? NODE_TYPES.filter(
        (node) =>
          node.label.toLowerCase().includes(search.toLowerCase()) ||
          node.description.toLowerCase().includes(search.toLowerCase()),
      )
    : NODE_TYPES;

  const groupedNodes = filteredNodes.reduce(
    (acc, node) => {
      if (!acc[node.category]) acc[node.category] = [];
      acc[node.category].push(node);
      return acc;
    },
    {} as Record<string, NodeTypeDefinition[]>,
  );

  return (
    <aside className="w-64 border-r bg-background flex flex-col flex-shrink-0">
      {/* Search */}
      <div className="p-3 border-b">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("sidebar.searchNodes")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
      </div>

      {/* Node Types */}
      <ScrollArea className="flex-1">
        <div className="p-3">
          <Accordion
            type="multiple"
            value={expandedCategories}
            onValueChange={setExpandedCategories}
            className="space-y-2"
          >
            {(Object.keys(CATEGORIES) as Array<keyof typeof CATEGORIES>).map(
              (category) => {
                const nodes = groupedNodes[category] || [];
                if (nodes.length === 0) return null;

                return (
                  <AccordionItem
                    key={category}
                    value={category}
                    className="border-none"
                  >
                    <AccordionTrigger className="hover:no-underline py-2 px-2 rounded-md hover:bg-accent/50">
                      <div className="flex items-center gap-2">
                        {CATEGORIES[category].icon}
                        <span className="text-sm font-medium">
                          {CATEGORIES[category].label}
                        </span>
                        <Badge variant="secondary" className="ml-auto text-xs">
                          {nodes.length}
                        </Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pt-1 pb-0">
                      <div className="space-y-1">
                        {nodes.map((node, idx) => (
                          <NodeTypeCard
                            key={`${node.type}-${idx}`}
                            node={node}
                            onDragStart={handleDragStart}
                          />
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              },
            )}
          </Accordion>
        </div>
      </ScrollArea>

      {/* Variables Section */}
      <div className="border-t">
        <div className="p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">
              {t("sidebar.variables")}
            </span>
            <Button variant="ghost" size="icon" className="h-6 w-6">
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          {!workflow.variables || workflow.variables.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t("sidebar.noVariables")}
            </p>
          ) : (
            <div className="space-y-1">
              {workflow.variables.map((variable) => (
                <div
                  key={variable.id}
                  className="flex items-center gap-2 text-xs p-1.5 rounded bg-muted/50"
                >
                  <span className="font-mono">{variable.name}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {variable.type}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Settings */}
      <div className="border-t p-3">
        <Button variant="ghost" size="sm" className="w-full justify-start">
          <Settings className="mr-2 h-4 w-4" />
          {t("sidebar.workflowSettings")}
        </Button>
      </div>
    </aside>
  );
}
