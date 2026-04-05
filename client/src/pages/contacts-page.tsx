import { useLocation } from "wouter";
import { ChevronLeft, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/use-auth";
import { BottomNav } from "@/components/bottom-nav";
import { useSwipeToClose } from "@/hooks/use-swipe-to-close";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { User } from "@shared/schema";
import { getDisplayName, getDisplayInitial } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ContactsPageProps {
  onClose?: () => void;
  onSelectContact?: (member: User) => void;
}

export function ContactsPage({ onClose, onSelectContact }: ContactsPageProps = {}) {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const isSheetMode = Boolean(onClose);
  const [addContactOpen, setAddContactOpen] = useState(false);

  const isAndroid = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    const userAgent = navigator.userAgent.toLowerCase();
    return userAgent.indexOf('android') > -1;
  }, []);

  const { handleTouchStart, handleTouchMove, handleTouchEnd } = useSwipeToClose({
    onSwipeRight: () => {
      if (isSheetMode && onClose) {
        onClose();
      } else {
        navigate("/menu");
      }
    }
  });

  const { data: teamMembers = [], isLoading: teamMembersLoading } = useQuery<User[]>({
    queryKey: ["/api/users", user?.teamId, "contacts"],
    queryFn: async () => {
      if (!user?.teamId) return [];
      try {
        const response = await apiRequest("GET", "/api/users");
        if (response.status === 403 || !response.ok) return [];
        const users = await response.json();
        return users.filter((member: User) => member.teamId === user.teamId && member.id !== user.id);
      } catch {
        return [];
      }
    },
    enabled: !!user?.teamId,
  });

  const { data: unreadMessagesData = [] } = useQuery<Array<{senderId: number, count: number}>>({
    queryKey: ["/api/messages/unread/by-sender"],
    queryFn: async () => {
      try {
        const response = await apiRequest("GET", "/api/messages/unread/by-sender");
        if (!response.ok) return [];
        const data = await response.json();
        if (Array.isArray(data)) return data;
        return Object.keys(data).map(key => ({ senderId: parseInt(key), count: 1 }));
      } catch {
        return [];
      }
    },
    enabled: !!user,
  });

  const unreadMessages = useMemo(() => {
    const lookup: Record<number, boolean> = {};
    if (Array.isArray(unreadMessagesData)) {
      unreadMessagesData.forEach(item => {
        lookup[item.senderId] = true;
      });
    } else {
      Object.keys(unreadMessagesData).forEach(key => {
        lookup[parseInt(key)] = true;
      });
    }
    return lookup;
  }, [unreadMessagesData]);

  if (!user) return null;

  const handleBackClick = () => {
    if (isSheetMode && onClose) {
      onClose();
    } else {
      navigate("/menu");
    }
  };

  const handleContactSelect = (member: User) => {
    if (onSelectContact) {
      onSelectContact(member);
    }
  };

  return (
    <div
      className="flex flex-col h-screen pb-16 md:pb-0"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <header className="sticky top-0 z-50 border-b border-border bg-background flex-shrink-0">
        <div className="container flex items-center justify-between p-4 pt-16">
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="icon"
              className="mr-2 scale-125"
              onClick={handleBackClick}
              data-testid="button-back"
            >
              <ChevronLeft className="h-8 w-8 scale-125" />
            </Button>
            <h1 className="text-lg font-semibold">Contacts</h1>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="scale-125"
            onClick={() => setAddContactOpen(true)}
            disabled={!user?.teamId}
          >
            <Plus className="h-6 w-6" />
          </Button>
        </div>
      </header>

      <div className={`flex-1 overflow-y-auto ${isAndroid ? 'pb-40' : ''}`}>
        <div className="container py-4 max-w-4xl mx-auto">
          {teamMembersLoading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400 mb-2" />
              <p className="text-gray-500 text-sm">Loading contacts...</p>
            </div>
          ) : teamMembers.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              {user?.teamId ? "No team members found" : "Join a team to see contacts"}
            </div>
          ) : (
            <div className="space-y-2 px-2">
              {teamMembers.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center gap-3 p-3 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg cursor-pointer border border-border"
                  onClick={() => handleContactSelect(member)}
                >
                  <Avatar>
                    {member.imageUrl && <AvatarImage src={member.imageUrl} alt={getDisplayName(member)} />}
                    <AvatarFallback
                      style={{ backgroundColor: member.avatarColor || '#6366F1' }}
                      className="text-white"
                    >
                      {getDisplayInitial(member)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className={`${unreadMessages[member.id] ? 'font-extrabold' : 'font-normal'} text-foreground`}>
                      {getDisplayName(member)}
                    </p>
                  </div>
                  {unreadMessages[member.id] && (
                    <Badge variant="destructive" className="text-xs">New</Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <AddContactDialog
        open={addContactOpen}
        onOpenChange={setAddContactOpen}
        existingContactIds={teamMembers.map(m => m.id)}
        onSelectContact={handleContactSelect}
      />

      <BottomNav />
    </div>
  );
}

function AddContactDialog({
  open,
  onOpenChange,
  existingContactIds,
  onSelectContact,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingContactIds: number[];
  onSelectContact: (member: User) => void;
}) {
  const { user } = useAuth();
  const [search, setSearch] = useState("");

  const { data: allUsers = [], isLoading } = useQuery<User[]>({
    queryKey: ["/api/users/same-organization"],
    queryFn: async () => {
      try {
        const response = await apiRequest("GET", "/api/users/same-organization");
        if (!response.ok) return [];
        return await response.json();
      } catch {
        return [];
      }
    },
    enabled: open && !!user,
  });

  const nonTeamUsers = useMemo(() => {
    const filtered = allUsers.filter(u => !existingContactIds.includes(u.id));
    if (!search.trim()) return filtered;
    const term = search.toLowerCase();
    return filtered.filter(u => {
      const name = getDisplayName(u).toLowerCase();
      return name.includes(term);
    });
  }, [allUsers, existingContactIds, search]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add Contact</DialogTitle>
        </DialogHeader>
        <input
          type="text"
          placeholder="Search by name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground mb-2"
        />
        <div className="flex-1 overflow-y-auto space-y-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : nonTeamUsers.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">No additional contacts found</p>
          ) : (
            nonTeamUsers.map((member) => (
              <div
                key={member.id}
                className="flex items-center gap-3 p-3 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg cursor-pointer"
                onClick={() => {
                  onSelectContact(member);
                  onOpenChange(false);
                }}
              >
                <Avatar className="h-8 w-8">
                  {member.imageUrl && <AvatarImage src={member.imageUrl} alt={getDisplayName(member)} />}
                  <AvatarFallback
                    style={{ backgroundColor: member.avatarColor || '#6366F1' }}
                    className="text-white text-xs"
                  >
                    {getDisplayInitial(member)}
                  </AvatarFallback>
                </Avatar>
                <span className="text-foreground">{getDisplayName(member)}</span>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ContactsPage;
