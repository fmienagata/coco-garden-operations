import type { ReactNode } from 'react';
import { RESTAURANT_NAME } from '../lib/restaurant';

export default function ModulePageHeader({ title, description, actions }: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return <header className="module-page-header">
    <div><p className="eyebrow">{RESTAURANT_NAME} · ESPACE ÉQUIPE</p><h1>{title}</h1><p className="muted">{description}</p></div>
    {actions && <div className="module-page-actions">{actions}</div>}
  </header>;
}
