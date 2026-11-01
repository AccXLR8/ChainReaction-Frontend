import { getNationalityInfo } from './countries';

type NationalityDisplayProps = {
  value: string | null | undefined;
  className?: string;
  showName?: boolean;
};

/** Small flag and readable country label for profile and in-game player tags. */
export function NationalityDisplay({
  value,
  className = '',
  showName = true,
}: NationalityDisplayProps) {
  const nationality = getNationalityInfo(value);
  const label = `Nationality: ${nationality.name}`;

  return (
    <span
      className={`nationality-display ${className}`.trim()}
      role="img"
      title={label}
      aria-label={label}
    >
      <span className="nationality-flag" aria-hidden="true">{nationality.flag}</span>
      {showName && <span className="nationality-name">{nationality.name}</span>}
    </span>
  );
}
