import Link from "next/link";

interface SortHeaderProps {
  label: string;
  ascValue: string;
  descValue: string;
  currentSort: string;
  searchParams: URLSearchParams;
  basePath: string;
}

export function SortHeader({ label, ascValue, descValue, currentSort, searchParams, basePath }: SortHeaderProps) {
  const nextSort = currentSort === descValue ? ascValue : descValue;
  const params = new URLSearchParams(searchParams);
  params.set("sort", nextSort);
  const active = currentSort === ascValue || currentSort === descValue;

  return (
    <Link
      href={`${basePath}?${params.toString()}`}
      className={`inline-flex items-center gap-1 hover:text-foreground ${active ? "text-foreground" : ""}`}
    >
      {label}
      {active ? <span aria-hidden>{currentSort === descValue ? "▼" : "▲"}</span> : null}
    </Link>
  );
}
