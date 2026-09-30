import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { Badge, Card, btnGhost, td, th } from "@/components/ui";
import { CreateUserForm, EmailForm, ResetPasswordForm } from "@/components/UserForms";
import { changeRoleAction, toggleUserAction } from "./actions";
import { input } from "@/components/ui";

export default async function Users() {
  const me = await requireRole("ADMIN");
  const users = await db.user.findMany({ orderBy: [{ role: "asc" }, { username: "asc" }], include: { _count: { select: { students: true } } } });
  return (
    <div className="space-y-6">
      <div><Link href="/admin" className="text-sm text-slate-500 hover:underline">← Admin</Link><h1 className="text-xl font-semibold">Users</h1></div>
      <Card title="Add a user"><CreateUserForm /></Card>
      <Card title={`Accounts (${users.length})`}>
        <div className="-m-5 overflow-x-auto">
          <table className="w-full"><thead><tr><th className={th}>Username</th><th className={th}>Name</th><th className={th}>Email (replies go here)</th><th className={th}>Role</th><th className={th}>Advisees</th><th className={th}>Status</th><th className={th}>Password</th><th className={th}></th></tr></thead>
            <tbody className="divide-y divide-slate-100">{users.map((u) => (
              <tr key={u.id}>
                <td className={`${td} font-mono`}>{u.username}</td><td className={td}>{u.name}{u.authProvider !== "LOCAL" && <div className="text-xs text-slate-500">{u.authProvider.toLowerCase()} sign-in</div>}</td>
                <td className={td}><EmailForm id={u.id} email={u.email} required={u.role === "ADVISOR"} />{u.role === "ADVISOR" && u.email === `${u.username}@dsu.edu.pk` && <div className="mt-1 text-xs text-amber-700">Check this is the advisor&apos;s real mailbox</div>}</td>
                <td className={td}>{u.id === me.userId ? <Badge tone="violet">{u.role.toLowerCase()} (you)</Badge> : <form action={changeRoleAction} className="flex items-center gap-2"><input type="hidden" name="id" value={u.id} /><select name="role" defaultValue={u.role} className={`${input} w-40`} aria-label={`Role for ${u.username}`}><option value="ADVISOR">Advisor</option><option value="HOD">HoD</option><option value="ADMIN">Admin</option></select><button className={btnGhost}>Set</button></form>}</td>
                <td className={td}>{u._count.students}</td>
                <td className={td}><Badge tone={u.active ? "green" : "red"}>{u.active ? "active" : "disabled"}</Badge></td>
                <td className={td}><ResetPasswordForm id={u.id} /></td>
                <td className={td}>{u.id !== me.userId && <form action={toggleUserAction}><input type="hidden" name="id" value={u.id} /><button className={btnGhost}>{u.active ? "Disable" : "Enable"}</button></form>}</td>
              </tr>))}</tbody></table>
        </div>
      </Card>
    </div>
  );
}
