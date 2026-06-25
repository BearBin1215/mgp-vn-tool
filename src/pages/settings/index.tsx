import Page from '@/components/page';
import InterfaceSettings from './InterfaceSettings';
import MoegirlSettings from './MoegirlSettings';
import FeishuSettings from './FeishuSettings';
import ErogamescapeSettings from './ErogamescapeSettings';

export default function Settings() {
  return (
    <Page>
      <div className='flex flex-col gap-3'>
        <InterfaceSettings />
        <MoegirlSettings />
        <FeishuSettings />
        <ErogamescapeSettings />
      </div>
    </Page>
  );
}
