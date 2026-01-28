'use client';

import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { workflowBuilderApi } from '@/lib/api/workflow-builder';
import { cn } from '@/lib/utils';
import useSWR from 'swr';
import { useTranslations } from 'next-intl';

interface WorkflowSelectorProps {
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export function WorkflowSelector({
  value,
  onChange,
  disabled,
  placeholder,
  className,
}: WorkflowSelectorProps) {
  const t = useTranslations('workflow.common');
  const [open, setOpen] = React.useState(false);

  const { data: workflows, isLoading } = useSWR(
    ['workflows', 'active'],
    async () => {
      const { workflows } = await workflowBuilderApi.list({
        status: 'active' as any,
        limit: 100,
      });
      return workflows;
    }
  );

  const selectedWorkflow = workflows?.find((w) => w.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || isLoading}
          className={cn('w-full justify-between', className)}
        >
          {selectedWorkflow ? (
            <span className="truncate">{selectedWorkflow.name}</span>
          ) : (
            <span className="text-muted-foreground">
              {isLoading ? t('loading') : placeholder || t('select_workflow')}
            </span>
          )}
          {isLoading ? (
            <Loader2 className="ml-2 h-4 w-4 animate-spin opacity-50" />
          ) : (
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command>
          <CommandInput placeholder={t('search_workflows')} />
          <CommandList>
            <CommandEmpty>{t('no_workflows_found')}</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="none"
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                }}
                className="text-muted-foreground italic"
              >
                <Check
                  className={cn(
                    'mr-2 h-4 w-4',
                    value === null ? 'opacity-100' : 'opacity-0'
                  )}
                />
                {t('none')}
              </CommandItem>
              {workflows?.map((workflow) => (
                <CommandItem
                  key={workflow.id}
                  value={`${workflow.name}-${workflow.id}`} // Composite value for uniqueness and search
                  className="cursor-pointer data-[disabled]:pointer-events-auto data-[disabled]:opacity-100" // Override cmdk disabled state
                  onSelect={() => {
                    onChange(workflow.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      value === workflow.id ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  {workflow.name}
                  {workflow.description && (
                    <span className="ml-2 truncate text-xs text-muted-foreground">
                      - {workflow.description}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
