import Page from '@/components/page';
import InterfaceSettings from './interface-settings';
import MoegirlSettings from './moegirl-settings';
import FeishuSettings from './feishu-settings';
import BangumiSettings from './bangumi-settings';
import ErogamescapeSettings from './erogamescape-settings';

export default function Settings() {
  return (
    <Page>
      <div className='flex flex-col gap-3'>
        <InterfaceSettings />
        <MoegirlSettings />
        <FeishuSettings />
        <BangumiSettings />
        <ErogamescapeSettings />
      </div>
    </Page>
  );
}
