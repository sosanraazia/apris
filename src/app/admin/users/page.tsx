import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { Badge, Card, btnGhost, td, th } from "@/components/ui";
import { CreateUserForm, ResetPasswordForm } from "@/components/UserForms";
import { toggleUserAction } from "./actions";

export default async function Users() {
  const me = await requireRole("ADMIN");
  const users = await db.user.findMany({ orderBy: [{ role: "asc" }, { username: "asc" }], include: { _count: { select: { students: true } } } });
  return (
    <div className="space-y-6">
      <div><Link href="/admin" className="text-sm text-slate-500 hover:underline">← Admin</Link><h1 className="text-xl font-semibold">Users</h1></div>
      <Card title="Add a user"><CreateUserForm /></Card>
      <Card title={`Accounts (${users.length})`}>
        <div className="-m-5 overflow-x-auto">
          <table className="w-full"><thead><tr><th className={th}>Username</th><th className={th}>Name</th><th className={th}>Role</th><th className={th}>Advisees</th><th className={th}>Status</th><th className={th}>Password</th><th className={th}></th></tr></thead>
            <tbody className="divide-y divide-slate-100">{users.map((u) => (
              <tr key={u.id}>
                <td className={`${td} font-mono`}>{u.username}</td><td className={td}>{u.name}<div className="text-xs text-slate-500">{u.email}</div></td>
                <td className={td}><Badge tone={u.role === "ADMIN" ? "violet" : u.role === "HOD" ? "blue" : "slate"}>{u.role.toLowerCase()}</Badge></td>
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
