import { composeStories } from "@storybook/react";
import { cleanup, render } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";

// Every story renders. Keeps the Storybook current: a story broken by a prop or data
// change fails here instead of on someone's PR preview.
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const modules = import.meta.glob<Parameters<typeof composeStories>[0]>("../**/*.stories.tsx", {
  eager: true,
});

const cases = Object.entries(modules).flatMap(([file, mod]) =>
  Object.entries(composeStories(mod)).map(([name, Story]) => [`${file} › ${name}`, Story] as const)
);

it("finds the stories", () => {
  expect(cases.length).toBeGreaterThan(30);
});

it.each(cases)("%s renders", async (_, Story) => {
  const { container } = render(
    <TooltipProvider>
      <Story />
    </TooltipProvider>
  );
  expect(container.firstChild).not.toBeNull();
  cleanup();
});
