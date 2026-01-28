'use client';

import { WorkflowSelector } from '@/components/workflow/settings/workflow-selector';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { workflowBuilderApi } from '@/lib/api/workflow-builder';
import useSWR, { mutate } from 'swr';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useNotification } from '@/hooks/use-notification';

interface WorkflowAssignmentDialogProps {
  chatId: string;
  activeWorkflowId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WorkflowAssignmentDialog({
  chatId,
  activeWorkflowId,
  open,
  onOpenChange,
}: WorkflowAssignmentDialogProps) {
  const t = useTranslations('workflow.assignment');
  const { addNotification } = useNotification();
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(
    activeWorkflowId
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleAssignment = async (workflowId: string) => {
    setIsProcessing(true);
    try {
      await workflowBuilderApi.chatState.assign(chatId, workflowId);
      addNotification(t('success_assigned'), 'success');
      mutate(['chat-workflow-state', chatId]);
      onOpenChange(false);
    } catch (error) {
      addNotification(t('error_assigning'), 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUnassignment = async () => {
    setIsProcessing(true);
    try {
      await workflowBuilderApi.chatState.unassign(chatId);
      addNotification(t('success_unassigned'), 'success');
      mutate(['chat-workflow-state', chatId]);
      onOpenChange(false);
    } catch (error) {
      addNotification(t('error_unassigning'), 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSave = () => {
    if (selectedWorkflowId === activeWorkflowId) {
      onOpenChange(false);
      return;
    }

    if (activeWorkflowId && selectedWorkflowId) {
      setConfirmOpen(true);
      return;
    }

    if (selectedWorkflowId) {
      handleAssignment(selectedWorkflowId);
    } else {
      if (activeWorkflowId) {
        setConfirmOpen(true);
      } else {
        onOpenChange(false);
      }
    }
  };

  const handleConfirm = () => {
    if (selectedWorkflowId) {
      handleAssignment(selectedWorkflowId);
    } else {
      handleUnassignment();
    }
    setConfirmOpen(false);
  };


  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('title')}</DialogTitle>
            <DialogDescription>{t('description')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t('select_label')}</Label>
              <WorkflowSelector
                value={selectedWorkflowId}
                onChange={setSelectedWorkflowId}
                placeholder={t('select_placeholder')}
              />
            </div>
            {activeWorkflowId && !selectedWorkflowId && (
              <p className="text-sm text-destructive">
                {t('warning_stop_workflow')}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button onClick={handleSave} disabled={isProcessing}>
              {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('confirm_title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedWorkflowId
                ? t('confirm_reassign_message')
                : t('confirm_stop_message')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>
              {t('confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
