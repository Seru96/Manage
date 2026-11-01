/**
 * Iconos de línea monocromos (los mismos trazos que IMPLANTA Install): toman el color
 * del texto, así se ven bien en claro y en oscuro.
 */
const PATHS = {
  home: 'M3.5 9.5 10 4l6.5 5.5M5.5 8v8h3.5v-4.5h2V16h3.5V8',
  newDoc: 'M5 2.75h6.5L15 6.25V17.25H5zM11.5 2.75v3.5H15M10 9v6M7 12h6',
  folder: 'M2.75 5.25h5l1.5 1.75h8v9.25H2.75zM2.75 8.5h14.5',
  gear: 'M10 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4',
  excel: 'M3.5 3.5h13v13h-13zM3.5 8h13M3.5 12.5h13M8 3.5v13',
  search: 'M8.5 3.5a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12.2 12.2 16.5 16.5',
  trash: 'M3.5 5.5h13M8 5.5V3.5h4v2M5.5 5.5l.8 11h7.4l.8-11M8.5 8.5v5M11.5 8.5v5',
  plus: 'M10 4v12M4 10h12',
  close: 'M5.5 5.5l9 9M14.5 5.5l-9 9',
  tasks: 'M3.5 4.5l1.5 1.5 2.5-3M3.5 10.5l1.5 1.5 2.5-3M3.5 16.5h3M10 5h6.5M10 11h6.5M10 16.5h6.5',
  calendar: 'M3 4.5h14v12.5H3zM3 8h14M6.5 2.5v3.5M13.5 2.5v3.5M6 11h2M9 11h2M12 11h2M6 14h2M9 14h2',
  notes: 'M4 3h12v10.5L12.5 17H4zM12.5 17v-3.5H16M7 7h6M7 10h4',
  bell: 'M10 3a4.5 4.5 0 0 0-4.5 4.5V11L4 13.5h12L14.5 11V7.5A4.5 4.5 0 0 0 10 3zM8.3 16a1.8 1.8 0 0 0 3.4 0',
  badge: 'M4 3.5h12v13H4zM8 3.5V6h4V3.5M10 8.5a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6zM6.8 15c.4-1.5 1.7-2.3 3.2-2.3s2.8.8 3.2 2.3',
  sync: 'M15.5 8A5.8 5.8 0 0 0 4.7 6.3M4.5 12a5.8 5.8 0 0 0 10.8 1.7M4.5 3.5v3h3M15.5 16.5v-3h-3',
  warn: 'M10 3.5 17.5 16.5h-15zM10 8.5v3.5M10 14.2v.3',
  person: 'M10 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM4.5 16.5c.7-2.8 2.9-4.3 5.5-4.3s4.8 1.5 5.5 4.3',
  chevL: 'M12.5 4.5 7 10l5.5 5.5',
  chevR: 'M7.5 4.5 13 10l-5.5 5.5',
  money: 'M2.5 5.5h15v9h-15zM10 7.8a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4zM5 8v4M15 8v4',
  docs: 'M6.5 2.5h7l3 3v9.5h-10zM13.5 2.5v3h3M3.5 6v11.5h9M9 9h5M9 12h5',
  link: 'M8.5 11.5l3-3M7 9.5 5.3 11.2a2.5 2.5 0 0 0 3.5 3.5L10.5 13M13 10.5l1.7-1.7a2.5 2.5 0 0 0-3.5-3.5L9.5 7',
  open: 'M11 3.5h5.5V9M16.5 3.5 9.5 10.5M14 12v4.5H3.5V6H8',
  copy: 'M7 7h9.5v9.5H7zM13 7V3.5H3.5V13H7',
  users: 'M7.5 4.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM2.5 15.5c.5-2.4 2.5-3.8 5-3.8s4.5 1.4 5 3.8M13 5a2.2 2.2 0 0 1 0 4.3M14.5 11.9c1.5.5 2.6 1.8 3 3.6',
  site: 'M10 17s5.5-5 5.5-9.2a5.5 5.5 0 0 0-11 0C4.5 12 10 17 10 17zM10 6a1.8 1.8 0 1 0 0 3.6A1.8 1.8 0 0 0 10 6z',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg className={`icon-line${className ? ` ${className}` : ''}`} width={size} height={size} viewBox="0 0 20 20" aria-hidden
      fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
      <path d={PATHS[name]} />
    </svg>
  );
}
