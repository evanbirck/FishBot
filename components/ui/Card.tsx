type CardProps = {
  title?: string;
  eyebrow?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

export function Card({ title, eyebrow, action, children, className }: CardProps) {
  return (
    <section className={["card", className].filter(Boolean).join(" ")}>
      {(title || eyebrow || action) && (
        <div className="card-header">
          <div>
            {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
            {title ? <h2>{title}</h2> : null}
          </div>
          {action ? <div className="card-action">{action}</div> : null}
        </div>
      )}
      {children}
    </section>
  );
}
