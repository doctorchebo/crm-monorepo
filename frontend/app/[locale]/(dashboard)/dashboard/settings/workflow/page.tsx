import { useTranslations } from 'next-intl';
import { SettingsPage } from '@/components/settings';
import { WorkflowSettings } from '@/components/workflow/settings/workflow-settings';

export default function WorkflowSettingsPage() {
  const t = useTranslations('workflow.settings');

  return (
    <SettingsPage
      title={t('title')}
      description={t('description')}
    >
      <WorkflowSettings />
    </SettingsPage>
  );
}
