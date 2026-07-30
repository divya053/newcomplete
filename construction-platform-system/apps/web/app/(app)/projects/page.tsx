import { EmptyState } from "@ci/ui";

// Placeholder feature surface — proves a new screen assembles from @ci/ui primitives
// alone (exit gate #7). The projects context itself is a later-phase module.
export default function ProjectsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Projects</h1>
      <EmptyState title="No projects" hint="The project surface is built in a later phase." />
    </div>
  );
}
