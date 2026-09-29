import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";

export default async function Account() {
  if (!(await getSession())) redirect("/login");
  return <ChangePasswordForm />;
}
