import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  parseThemePreference,
  setThemePreference,
  useThemePreference,
  type ThemePreference,
} from '@/lib/theme';

interface ThemeOption {
  value: ThemePreference;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
}

const OPTIONS: readonly ThemeOption[] = [
  { value: 'light', label: 'Terang', shortLabel: 'Terang', icon: Sun },
  { value: 'dark', label: 'Gelap', shortLabel: 'Gelap', icon: Moon },
  { value: 'system', label: 'Ikuti Sistem', shortLabel: 'Sistem', icon: Monitor },
];

function currentOption(preference: ThemePreference): ThemeOption {
  return OPTIONS.find((option) => option.value === preference) ?? OPTIONS[2];
}

/** Tombol ikon di top bar (desktop): menu Terang / Gelap / Ikuti Sistem. */
export function ThemeMenu() {
  const preference = useThemePreference();
  const current = currentOption(preference);
  const CurrentIcon = current.icon;
  const label = `Tema tampilan: ${current.label}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" className="h-8 w-8 p-0" aria-label={label} title={label}>
            <CurrentIcon className="size-4" />
          </Button>
        }
      />
      <DropdownMenuContent side="bottom" align="end" sideOffset={6} className="min-w-[170px]">
        <DropdownMenuRadioGroup
          value={preference}
          onValueChange={(value) => setThemePreference(parseThemePreference(value))}
        >
          {OPTIONS.map(({ value, label: optionLabel, icon: Icon }) => (
            <DropdownMenuRadioItem key={value} value={value} closeOnClick>
              <Icon className="mr-2 size-4 text-muted-foreground" />
              {optionLabel}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Pilihan tema tiga segmen untuk menu mobile (Sheet). */
export function ThemeToggleGroup() {
  const preference = useThemePreference();

  return (
    <ToggleGroup
      value={[preference]}
      onValueChange={(groupValue: string[]) => {
        const next = groupValue[groupValue.length - 1];
        if (next) setThemePreference(parseThemePreference(next));
      }}
      className="w-full justify-stretch"
      aria-label="Tema tampilan"
    >
      {OPTIONS.map(({ value, shortLabel, icon: Icon }) => (
        <ToggleGroupItem key={value} value={value} className="flex-1 gap-1.5 text-xs">
          <Icon className="size-3.5" />
          {shortLabel}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
