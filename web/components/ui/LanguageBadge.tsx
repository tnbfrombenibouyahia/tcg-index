// 'EN' n'est pas affiché : c'est encore la langue quasi exclusive du
// catalogue (cf. mémoire projet), la pastille n'apparaît que pour distinguer
// une édition non-anglaise (ex. scellé JP) plutôt que de marteler "EN" sur
// ~100% des lignes.
export function LanguageBadge({ language }: { language: string }) {
  if (language === "EN") return null;

  return (
    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
      {language}
    </span>
  );
}
