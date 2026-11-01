import { COUNTRY_OPTIONS, getNationalityInfo, normalizeNationality } from './countries';

type NationalityPickerProps = {
  id: string;
  value: string | null | undefined;
  onChange: (nationality: string) => void;
  label?: string;
};

/** Optional ISO alpha-2 selection with a global default for guests and skipped choices. */
export function NationalityPicker({
  id,
  value,
  onChange,
  label = 'Nationality (optional)',
}: NationalityPickerProps) {
  const selected = normalizeNationality(value);
  const global = getNationalityInfo('global');

  return (
    <label className="nationality-picker" htmlFor={id}>
      <span>{label}</span>
      <select
        id={id}
        value={selected}
        onChange={(event) => onChange(normalizeNationality(event.target.value))}
      >
        <option value="global">{global.flag} {global.name} · not selected</option>
        {COUNTRY_OPTIONS.map((country) => (
          <option value={country.value} key={country.value}>
            {country.flag} {country.name}
          </option>
        ))}
      </select>
    </label>
  );
}
