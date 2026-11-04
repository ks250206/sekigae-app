import { Check, Languages, Monitor, Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePrefs, type LanguagePref, type ThemePref } from "@/store/prefs";
import { useTheme } from "./theme";

const themeIcons = { light: Sun, dark: Moon, system: Monitor } as const;

export function ThemeMenu() {
  const { t } = useTranslation();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const Icon = resolvedTheme === "dark" ? Moon : Sun;

  const change = (next: ThemePref) => {
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (doc.startViewTransition && !reduce) doc.startViewTransition(() => setTheme(next));
    else setTheme(next);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("header.theme")} data-testid="theme-menu">
          <Icon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {(["light", "dark", "system"] as const).map((key) => {
          const ItemIcon = themeIcons[key];
          return (
            <DropdownMenuItem key={key} onSelect={() => change(key)}>
              <ItemIcon className="size-4" />
              {t(`theme.${key}`)}
              {theme === key && <Check className="ml-auto size-4" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function LanguageMenu() {
  const { t, i18n } = useTranslation();
  const setLanguage = usePrefs((s) => s.setLanguage);
  const current = (i18n.resolvedLanguage ?? "ja") as LanguagePref;
  const change = (lng: LanguagePref) => {
    setLanguage(lng);
    void i18n.changeLanguage(lng);
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("header.language")}
          data-testid="language-menu"
        >
          <Languages className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {(["ja", "en"] as const).map((lng) => (
          <DropdownMenuItem key={lng} onSelect={() => change(lng)} lang={lng}>
            {t(`language.${lng}`)}
            {current === lng && <Check className="ml-auto size-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
