import { useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import {
  KeyRound,
  Loader2,
  Palette,
  Save,
  Shield,
  Upload,
  UserCog,
} from "lucide-react";
import { usePageMeta } from "@/store/pageMeta";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { repo } from "@/data";
import { useAuth } from "@/store/auth";
import { useTheme, type ThemeMode } from "@/store/theme";
import { cn, initials, roleLabel } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

export default function ProfilePage() {
  const { user, refresh } = useAuth();
  const { mode, setMode } = useTheme();

  const [displayName, setDisplayName] = useState(
    user?.displayName || user?.name || "",
  );
  const [fullName, setFullName] = useState(user?.name ?? "");
  const [username, setUsername] = useState(
    user?.username || user?.email.split("@")[0] || "",
  );
  const [email, setEmail] = useState(user?.email ?? "");
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(
    user?.avatarUrl,
  );
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [savingPw, setSavingPw] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  usePageMeta("Profile", "Manage your account information.");

  if (!user) return null;

  const onPicture = (file?: File) => {
    if (!file) return;
    if (file.size > 400_000) {
      toast({
        variant: "destructive",
        title: "Image too large",
        description: "Please use an image under 400 KB.",
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setAvatarUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  const saveProfile = async () => {
    if (!displayName.trim() || !fullName.trim() || !email.trim()) {
      toast({
        variant: "destructive",
        title: "Display name, full name and email are required.",
      });
      return;
    }
    setSavingProfile(true);
    try {
      await repo.updateUser(user.id, {
        name: fullName,
        displayName,
        username,
        email,
        avatarUrl,
      });
      await refresh();
      toast({ variant: "success", title: "Profile updated" });
    } finally {
      setSavingProfile(false);
    }
  };

  const changePassword = async () => {
    if (currentPw !== user.password) {
      toast({ variant: "destructive", title: "Current password is incorrect." });
      return;
    }
    if (newPw.length < 4) {
      toast({
        variant: "destructive",
        title: "New password is too short.",
        description: "Use at least 4 characters.",
      });
      return;
    }
    if (newPw !== confirmPw) {
      toast({ variant: "destructive", title: "Passwords do not match." });
      return;
    }
    setSavingPw(true);
    try {
      await repo.updateUser(user.id, { password: newPw });
      await refresh();
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
      toast({ variant: "success", title: "Password changed" });
    } finally {
      setSavingPw(false);
    }
  };

  const themes: { key: ThemeMode; label: string }[] = [
    { key: "light", label: "Light" },
    { key: "dark", label: "Dark" },
    { key: "system", label: "System" },
  ];

  return (
    <div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Identity card */}
        <Card className="lg:col-span-1">
          <CardContent className="flex flex-col items-center py-8 text-center">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={displayName}
                className="h-24 w-24 rounded-full object-cover"
              />
            ) : (
              <span
                className="flex h-24 w-24 items-center justify-center rounded-full text-3xl font-bold text-white"
                style={{ backgroundColor: user.avatarColor ?? "#1d4ed8" }}
              >
                {initials(displayName || fullName)}
              </span>
            )}

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => onPicture(e.target.files?.[0])}
            />
            <div className="mt-3 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="h-4 w-4" />
                {avatarUrl ? "Change" : "Upload"}
              </Button>
              {avatarUrl && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setAvatarUrl(undefined)}
                >
                  Remove
                </Button>
              )}
            </div>

            <div className="mt-4 text-lg font-semibold">
              {displayName || fullName}
            </div>
            <Badge
              variant={user.role === "admin" ? "default" : "secondary"}
              className="mt-2 gap-1"
            >
              {user.role === "admin" ? (
                <Shield className="h-3 w-3" />
              ) : (
                <UserCog className="h-3 w-3" />
              )}
              {roleLabel(user.role)}
            </Badge>

            <div className="mt-6 w-full space-y-2 border-t border-border pt-4 text-left text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Member since</span>
                <span className="font-medium">
                  {format(parseISO(user.createdAt), "dd MMM yyyy")}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Last login</span>
                <span className="font-medium">
                  {user.lastLogin
                    ? format(parseISO(user.lastLogin), "dd MMM, HH:mm")
                    : "—"}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-5 lg:col-span-2">
          {/* Details */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserCog className="h-4 w-4 text-primary" /> Account Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Display Name</Label>
                  <Input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Shown in the sidebar"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Full Name</Label>
                  <Input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Username</Label>
                  <Input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Email Address</Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Your <span className="font-medium">Display Name</span> is what
                appears in the sidebar after login.
              </p>
              <Button onClick={saveProfile} disabled={savingProfile}>
                {savingProfile ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save Changes
              </Button>
            </CardContent>
          </Card>

          {/* Theme preference */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="h-4 w-4 text-primary" /> Theme Preference
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2">
                {themes.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setMode(t.key)}
                    className={cn(
                      "rounded-lg border-2 px-3 py-3 text-sm font-medium transition-colors",
                      mode === t.key
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/40",
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Password */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-primary" /> Change Password
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Current Password</Label>
                <Input
                  type="password"
                  value={currentPw}
                  onChange={(e) => setCurrentPw(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>New Password</Label>
                  <Input
                    type="password"
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Confirm New Password</Label>
                  <Input
                    type="password"
                    value={confirmPw}
                    onChange={(e) => setConfirmPw(e.target.value)}
                  />
                </div>
              </div>
              <Button onClick={changePassword} disabled={savingPw}>
                {savingPw ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <KeyRound className="h-4 w-4" />
                )}
                Update Password
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
