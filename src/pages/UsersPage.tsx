import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Eye, Plus, Search, Shield, Trash2, UserCog } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { repo } from "@/data";
import { useAuth } from "@/store/auth";
import type { Role, User } from "@/types";
import { initials, roleDescription } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

/** Icon shown alongside a role badge. */
function RoleIcon({ role, className }: { role: Role; className?: string }) {
  if (role === "admin") return <Shield className={className} />;
  if (role === "viewer") return <Eye className={className} />;
  return <UserCog className={className} />;
}

const AVATAR_COLORS = [
  "#1d4ed8",
  "#0ea5e9",
  "#059669",
  "#d97706",
  "#7c3aed",
  "#e11d48",
];

interface FormState {
  id?: string;
  name: string;
  email: string;
  password: string;
  role: Role;
  active: boolean;
}

const emptyForm: FormState = {
  name: "",
  email: "",
  password: "",
  role: "viewer",
  active: true,
};

export default function UsersPage() {
  const currentUser = useAuth((s) => s.user);
  const refreshAuth = useAuth((s) => s.refresh);
  const [users, setUsers] = useState<User[] | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");

  const load = () => repo.listUsers().then(setUsers);
  useEffect(() => {
    load();
  }, []);

  const filteredUsers = useMemo(() => {
    if (!users) return [];
    const q = query.toLowerCase().trim();
    return users.filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (q)
        return (
          u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
        );
      return true;
    });
  }, [users, query, roleFilter]);

  const openNew = () => {
    setForm(emptyForm);
    setDialogOpen(true);
  };
  const openEdit = (u: User) => {
    setForm({
      id: u.id,
      name: u.name,
      email: u.email,
      password: u.password,
      role: u.role,
      active: u.active,
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) {
      toast({ variant: "destructive", title: "All fields are required." });
      return;
    }
    setSaving(true);
    try {
      if (form.id) {
        await repo.updateUser(form.id, {
          name: form.name,
          email: form.email,
          password: form.password,
          role: form.role,
          active: form.active,
        });
        toast({ variant: "success", title: "User updated" });
        if (form.id === currentUser?.id) await refreshAuth();
      } else {
        await repo.createUser({
          name: form.name,
          email: form.email,
          password: form.password,
          role: form.role,
          active: form.active,
          avatarColor:
            AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
        });
        toast({ variant: "success", title: "User created" });
      }
      setDialogOpen(false);
      await load();
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Could not save user",
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (u: User) => {
    await repo.updateUser(u.id, { active: !u.active });
    await load();
  };

  const doDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await repo.deleteUser(toDelete.id);
      toast({ variant: "success", title: "User deleted" });
      setToDelete(null);
      await load();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      {/* Toolbar: search + role filter + add */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative max-w-xs flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search users…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="dispatch">Dispatch</SelectItem>
              <SelectItem value="viewer">Viewer</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4" />
          Add User
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {!users ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : (
            <>
            {/* Desktop / tablet table */}
            <Table className="hidden md:table">
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last Login</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span
                          className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold text-white"
                          style={{ backgroundColor: u.avatarColor ?? "#1d4ed8" }}
                        >
                          {initials(u.name)}
                        </span>
                        <div>
                          <div className="font-medium">
                            {u.name}
                            {u.id === currentUser?.id && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                (you)
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {u.email}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={u.role === "admin" ? "default" : "secondary"}
                        className="gap-1 capitalize"
                      >
                        <RoleIcon role={u.role} className="h-3 w-3" />
                        {u.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(parseISO(u.createdAt), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {u.lastLogin
                        ? format(parseISO(u.lastLogin), "dd MMM, HH:mm")
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={u.active}
                        onCheckedChange={() => toggleActive(u)}
                        disabled={u.id === currentUser?.id}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEdit(u)}
                        >
                          <UserCog className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          disabled={u.id === currentUser?.id}
                          onClick={() => setToDelete(u)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredUsers.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-14 text-center text-sm text-muted-foreground"
                    >
                      No users match your search.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            {/* Mobile cards */}
            <div className="divide-y divide-border md:hidden">
              {filteredUsers.map((u) => (
                <div key={u.id} className="flex items-center gap-3 p-4">
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                    style={{ backgroundColor: u.avatarColor ?? "#1d4ed8" }}
                  >
                    {initials(u.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{u.name}</span>
                      <Badge
                        variant={u.role === "admin" ? "default" : "secondary"}
                        className="gap-1 capitalize"
                      >
                        <RoleIcon role={u.role} className="h-3 w-3" />
                        {u.role}
                      </Badge>
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {u.email}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Switch
                      checked={u.active}
                      onCheckedChange={() => toggleActive(u)}
                      disabled={u.id === currentUser?.id}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9"
                      onClick={() => openEdit(u)}
                    >
                      <UserCog className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
              {filteredUsers.length === 0 && (
                <div className="py-14 text-center text-sm text-muted-foreground">
                  No users match your search.
                </div>
              )}
            </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Create / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit User" : "Add User"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="u-name">Full Name</Label>
              <Input
                id="u-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Jane Doe"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u-email">Email</Label>
              <Input
                id="u-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="jane@cementplant.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u-pw">Password</Label>
              <Input
                id="u-pw"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Set a password"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select
                  value={form.role}
                  onValueChange={(v) => setForm({ ...form, role: v as Role })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="dispatch">Dispatch</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {roleDescription(form.role)}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <div className="flex h-9 items-center gap-2">
                  <Switch
                    checked={form.active}
                    onCheckedChange={(v) => setForm({ ...form, active: v })}
                  />
                  <span className="text-sm text-muted-foreground">
                    {form.active ? "Active" : "Inactive"}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : form.id ? "Save Changes" : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(toDelete)}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Delete user?"
        description={
          toDelete
            ? `${toDelete.name} will lose access immediately. This cannot be undone.`
            : ""
        }
        destructive
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={doDelete}
      />
    </div>
  );
}
