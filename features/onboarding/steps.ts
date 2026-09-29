import type { OnboardingPath } from "@/lib/db/schema";

export type Step = { id: string; title: string; description: string; skippable: boolean };

/**
 * Setup is progressive: the organization exists after the first step, so a person is one
 * click from their workspace at any point. Everything after that is optional and resumable.
 */
export const STEPS: Record<OnboardingPath, Step[]> = {
  professional: [
    { id: "profile", title: "About you and your work", description: "Your name and the name customers will see.", skippable: false },
    { id: "services", title: "What do you do?", description: "Customers looking for these trades will find you. You can change this any time.", skippable: true },
    { id: "area", title: "Where do you work?", description: "You'll only be matched with jobs in the areas you choose.", skippable: true },
    { id: "hours", title: "When are you available?", description: "Your usual working hours. Emergencies can still reach you outside them.", skippable: true },
    { id: "verify", title: "Get ready to be verified", description: "Verified professionals get more requests. Add a licence or certificate now, or later.", skippable: true },
    { id: "done", title: "You're set up", description: "", skippable: false },
  ],
  business: [
    { id: "organization", title: "Tell us about your business", description: "The name customers will see, and roughly how big you are.", skippable: false },
    { id: "services", title: "What services do you offer?", description: "Customers looking for these trades will find you.", skippable: true },
    { id: "area", title: "Where do you work?", description: "Requests are matched to the areas you serve.", skippable: true },
    { id: "team", title: "Bring in your team", description: "Invite dispatchers, technicians and finance. They get a personal link to join.", skippable: true },
    { id: "hours", title: "Operating hours", description: "Dispatch plans visits inside these hours and warns you about anything outside.", skippable: true },
    { id: "done", title: "Your business is set up", description: "", skippable: false },
  ],
  facility: [
    { id: "organization", title: "Tell us about your organization", description: "What you manage, so we set up the right tools.", skippable: false },
    { id: "site", title: "Add your first site", description: "A hotel, office, plant or building. Add floors, rooms and assets later.", skippable: true },
    { id: "team", title: "Invite your team", description: "Facility managers raise and verify work; finance sees invoices.", skippable: true },
    { id: "providers", title: "Choose your providers", description: "Approve the service companies you already work with, or find new ones on the network.", skippable: true },
    { id: "done", title: "Your workspace is ready", description: "", skippable: false },
  ],
};

export const stepIndex = (path: OnboardingPath, id: string) => STEPS[path].findIndex((s) => s.id === id);
export const nextStepId = (path: OnboardingPath, id: string) => STEPS[path][Math.min(stepIndex(path, id) + 1, STEPS[path].length - 1)]!.id;
export const prevStepId = (path: OnboardingPath, id: string) => (stepIndex(path, id) > 0 ? STEPS[path][stepIndex(path, id) - 1]!.id : null);
export const stepHref = (id: string) => `/onboarding?step=${id}`;
