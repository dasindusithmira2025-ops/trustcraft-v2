import { Page, PageHeader } from "@/components/app/page";
import { SettingsNav } from "@/features/org/components/settings-nav";
import { settingsSections } from "@/features/org/sections";
import { requireWorkspace } from "@/lib/workspace";

export default async function SettingsLayout({ children, params }: LayoutProps<"/w/[org]/settings">) {
  const { org } = await params;
  const { membership: m } = await requireWorkspace(org);
  const sections = settingsSections({ slug: m.slug, kind: m.kind, role: m.role, modules: m.modules, segment: m.segment });
  return (
    <Page>
      <PageHeader title="Settings" description={m.name} />
      <div className="grid grid-cols-1 gap-x-10 gap-y-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <div className="min-w-0 lg:sticky lg:top-20 lg:self-start">
          <SettingsNav sections={sections} />
        </div>
        <div className="min-w-0 max-w-3xl">{children}</div>
      </div>
    </Page>
  );
}
