'use client';

import { WorkflowSelector } from '@/components/workflow/settings/workflow-selector';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { workflowBuilderApi } from '@/lib/api/workflow-builder';
import useSWR, { mutate } from 'swr';
import { useNotification } from '@/hooks/use-notification';
import { Loader2, Save } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useEffect } from 'react';

export function WorkflowSettings() {
  const t = useTranslations('workflow.settings');
  const { addNotification } = useNotification();
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(
    null
  );
  const [isSaving, setIsSaving] = useState(false);

  // Fetch current settings
  const { data: settings, isLoading } = useSWR(
    'workflow-settings',
    async () => {
      const data = await workflowBuilderApi.settings.get();
      return data;
    },
    {
      revalidateOnFocus: false,
    }
  );

  // Sync state with settings when loaded
  useEffect(() => {
    if (settings) {
      setSelectedWorkflowId(settings.defaultWorkflowId);
    }
  }, [settings]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await workflowBuilderApi.settings.update({ defaultWorkflowId: selectedWorkflowId });
      addNotification(t('settings_saved'), 'success');
      mutate('workflow-settings');
    } catch (error) {
      addNotification(t('settings_save_error'), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges = settings?.defaultWorkflowId !== selectedWorkflowId;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('default_workflow_title')}</CardTitle>
          <CardDescription>{t('default_workflow_description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t('default_workflow_label')}</Label>
            <div className="max-w-md">
              <WorkflowSelector
                value={selectedWorkflowId}
                onChange={setSelectedWorkflowId}
                placeholder={t('select_default_workflow')}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              {t('default_workflow_help')}
            </p>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={handleSave}
              disabled={!hasChanges || isSaving}
            >
              {isSaving && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {!isSaving && <Save className="mr-2 h-4 w-4" />}
              {t('save_changes')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
