import { useLocation } from "wouter";
import { ChevronLeft, Plus, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/use-auth";
import { BottomNav } from "@/components/bottom-nav";
import { useSwipeToClose } from "@/hooks/use-swipe-to-close";
import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { User } from "@shared/schema";
import { getDisplayName, getDisplayInitial } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
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
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    gcTime: 0,
  });

  const { data: addedContacts = [], isLoading: addedContactsLoading } = useQuery<User[]>({
    queryKey: ["/api/contacts"],
    queryFn: async () => {
      try {
        const response = await apiRequest("GET", "/api/contacts");
        if (!response.ok) return [];
        return await response.json();
      } catch {
        return [];
      }
    },
    enabled: !!user,
  });

  const removeContactMutation = useMutation({
    mutationFn: async (contactUserId: number) => {
      await apiRequest("DELETE", `/api/contacts/${contactUserId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
    },
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

  const teamMemberIds = useMemo(() => new Set(teamMembers.map(m => m.id)), [teamMembers]);
  const nonTeamAddedContacts = useMemo(
    () => addedContacts.filter(c => !teamMemberIds.has(c.id)),
    [addedContacts, teamMemberIds]
  );

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

  const allExistingIds = [
    ...teamMembers.map(m => m.id),
    ...addedContacts.map(c => c.id),
  ];

  const isLoading = teamMembersLoading || addedContactsLoading;

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
            data-testid="button-add-contact"
          >
            <Plus className="h-6 w-6" />
          </Button>
        </div>
      </header>

      <div className={`flex-1 overflow-y-auto ${isAndroid ? 'pb-40' : ''}`}>
        <div className="container py-4 max-w-4xl mx-auto">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400 mb-2" />
              <p className="text-gray-500 text-sm">Loading contacts...</p>
            </div>
          ) : teamMembers.length === 0 && nonTeamAddedContacts.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              {user?.teamId ? "No contacts yet. Tap + to add someone." : "Join a team to see contacts"}
            </div>
          ) : (
            <div className="space-y-2 px-2">
              {teamMembers.length > 0 && (
                <>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide px-3 pt-2" data-testid="text-team-section">Team Members</p>
                  {teamMembers.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center gap-3 p-3 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg cursor-pointer border border-border"
                      onClick={() => handleContactSelect(member)}
                      data-testid={`card-contact-${member.id}`}
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
                </>
              )}
              {nonTeamAddedContacts.length > 0 && (
                <>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide px-3 pt-4" data-testid="text-added-section">Added Contacts</p>
                  {nonTeamAddedContacts.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center gap-3 p-3 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg cursor-pointer border border-border"
                      onClick={() => handleContactSelect(member)}
                      data-testid={`card-contact-${member.id}`}
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
                        <Badge variant="destructive" className="text-xs mr-2">New</Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeContactMutation.mutate(member.id);
                        }}
                        data-testid={`button-remove-contact-${member.id}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <AddContactDialog
        open={addContactOpen}
        onOpenChange={setAddContactOpen}
        existingContactIds={allExistingIds}
        onContactAdded={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
        }}
      />

      <BottomNav />
    </div>
  );
}

function AddContactDialog({
  open,
  onOpenChange,
  existingContactIds,
  onContactAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingContactIds: number[];
  onContactAdded: () => void;
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

  const addContactMutation = useMutation({
    mutationFn: async (contactUserId: number) => {
      await apiRequest("POST", "/api/contacts", { contactUserId });
    },
    onSuccess: () => {
      onContactAdded();
    },
  });

  const availableUsers = useMemo(() => {
    if (!search.trim()) return [];
    const filtered = allUsers.filter(u => !existingContactIds.includes(u.id));
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
          data-testid="input-search-contact"
        />
        <div className="flex-1 overflow-y-auto space-y-2">
          {!search.trim() ? (
            <p className="text-center text-muted-foreground py-4">Type a name to search</p>
          ) : isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : availableUsers.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">No contacts found</p>
          ) : (
            availableUsers.map((member) => (
              <div
                key={member.id}
                className="flex items-center gap-3 p-3 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg cursor-pointer"
                onClick={() => {
                  addContactMutation.mutate(member.id);
                  onOpenChange(false);
                }}
                data-testid={`card-add-contact-${member.id}`}
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
