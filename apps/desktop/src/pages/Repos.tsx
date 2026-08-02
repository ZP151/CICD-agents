import { useNavigate } from "react-router-dom";
import {
  ActionButton,
  WorkbenchEmptyState,
  WorkbenchHeader,
  WorkbenchPage,
} from "../components/workbench/WorkbenchPrimitives.js";

export function RepositoriesEmptyState({ onOpenProjectLinks }: { onOpenProjectLinks: () => void }): JSX.Element {
  return (
    <WorkbenchEmptyState
      title="Manage repositories from Project Links"
      description="Connect a local repository and its workflow defaults once, then use it across Chat, Pull Requests, Pipelines, and Review Queue."
      action={<ActionButton tone="primary" onClick={onOpenProjectLinks}>Open Project Links</ActionButton>}
    />
  );
}

export default function Repos(): JSX.Element {
  const navigate = useNavigate();
  return (
    <WorkbenchPage>
      <WorkbenchHeader
        title="Repositories"
        description="Repository mappings now live with their connection and workflow settings."
      />
      <RepositoriesEmptyState onOpenProjectLinks={() => navigate("/project-links")} />
    </WorkbenchPage>
  );
}
