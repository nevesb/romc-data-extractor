import Link from "next/link";

type Props = {
  title: string;
  description?: string;
  meta?: string;
  href?: string;
  badge?: string;
  children?: React.ReactNode;
};

export function EntityCard({ title, description, meta, href, badge, children }: Props) {
  const inner = (
    <article className="romc-list-row">
      <div className="flex-1">
        <p className="romc-list-row__title">{title}</p>
        {description && <p className="romc-list-row__desc">{description}</p>}
        {children}
      </div>
      <div className="romc-list-row__meta">
        {badge && <span className="romc-pill">{badge}</span>}
        {meta && <span className="romc-meta">{meta}</span>}
      </div>
    </article>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {inner}
      </Link>
    );
  }

  return inner;
}
