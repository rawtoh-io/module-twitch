import { LockIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * Shown in place of org-scoped content when the current member's role is not
 * allowed to see it. Says *why* nothing is displayed instead of leaving an
 * empty list or a bare 403.
 */
export function AccessDenied({
	role,
	orgName,
	resource,
}: {
	role: string;
	orgName: string;
	resource: string;
}) {
	return (
		<Alert>
			<LockIcon />
			<AlertTitle>Nothing to show here</AlertTitle>
			<AlertDescription>
				<p>
					Nothing is displayed because your role in {orgName} is{" "}
					<strong>{role}</strong>, which is not allowed to view or manage{" "}
					{resource}. Only owners can.
				</p>
				<p>
					Ask an owner of this organization to change your role if you need
					access.
				</p>
			</AlertDescription>
		</Alert>
	);
}
