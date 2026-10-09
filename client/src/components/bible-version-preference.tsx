import { useMutation } from "@tanstack/react-query";
import { User } from "@shared/schema";
import { BIBLE_VERSION_CODES, BIBLE_VERSIONS, resolveBibleVersion } from "@shared/bible-versions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export function BibleVersionPreference({ user }: { user?: User | null }) {
  const { toast } = useToast();
  const mutation = useMutation({
    mutationFn: async (bibleVersion: string) => {
      const response = await apiRequest("PATCH", "/api/user/bible-version", { bibleVersion });
      if (!response.ok) throw new Error("Failed to save Bible version. Please try again.");
      return response.json() as Promise<{ bibleVersion: string }>;
    },
    onSuccess: async ({ bibleVersion }) => {
      queryClient.setQueryData<User | null>(["/api/user"], current =>
        current ? { ...current, bibleVersion } : current);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/user"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/users/me"] }),
      ]);
      toast({ title: "Bible version saved", description: `Bible verse links now open in ${bibleVersion}.` });
    },
    onError: (error: Error) => {
      toast({ title: "Couldn't save Bible version", description: error.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-2 border-t pt-3">
      <label htmlFor="bible-version" className="text-lg text-muted-foreground">Bible Version</label>
      <Select
        value={resolveBibleVersion(user?.bibleVersion)}
        onValueChange={value => mutation.mutate(value)}
        disabled={!user || mutation.isPending}
      >
        <SelectTrigger id="bible-version" data-testid="select-bible-version">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {BIBLE_VERSION_CODES.map(code => (
            <SelectItem key={code} value={code}>{code} — {BIBLE_VERSIONS[code].name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {mutation.isPending ? "Saving…" : "Daily Bible verse links open in this version. Changes save automatically."}
      </p>
    </div>
  );
}
