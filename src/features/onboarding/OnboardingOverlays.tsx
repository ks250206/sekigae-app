import { ShortcutsDialog } from "./ShortcutsDialog";
import { useOnboardingUi } from "./onboardingStore";
import { WelcomeDialog } from "./WelcomeDialog";

export function OnboardingOverlays() {
  const shortcutsOpen = useOnboardingUi((s) => s.shortcutsOpen);
  const setShortcutsOpen = useOnboardingUi((s) => s.setShortcutsOpen);
  return (
    <>
      <WelcomeDialog />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </>
  );
}
