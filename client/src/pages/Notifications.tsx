import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Bell, BellOff, CheckCheck, Trash2, TrendingUp, Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { zhTW } from "date-fns/locale";

export default function Notifications() {
  const isAuthenticated = true; // Bypassed for guest use
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const { data: notifications, isLoading } = trpc.notifications.list.useQuery(
    { limit: 50 },
    { enabled: true }
  );

  const markAllRead = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => {
      utils.notifications.list.invalidate();
      utils.notifications.unreadCount.invalidate();
      toast.success("已全部標為已讀");
    },
  });

  const markRead = trpc.notifications.markRead.useMutation({
    onSuccess: () => {
      utils.notifications.list.invalidate();
      utils.notifications.unreadCount.invalidate();
    },
  });

  const deleteNotif = trpc.notifications.delete.useMutation({
    onSuccess: () => {
      utils.notifications.list.invalidate();
      utils.notifications.unreadCount.invalidate();
      toast.success("通知已刪除");
    },
  });

  // This might not exist on the router but we keep it for now
  const triggerAutoRun = (trpc.notifications as any).triggerAutoRun?.useMutation({
    onSuccess: (data: any) => {
      utils.notifications.list.invalidate();
      utils.notifications.unreadCount.invalidate();
      utils.screener.getLatestResults.invalidate();
      if (data.totalMatched > 0) {
        toast.success(`篩選完成！發現 ${data.totalMatched} 支飆股`);
      } else {
        toast.info("篩選完成，今日未發現符合條件的飆股");
      }
    },
    onError: (err: any) => toast.error(`篩選失敗：${err.message}`),
  }) || { mutate: () => {}, isPending: false };

  const unreadCount = notifications?.filter((n: any) => !n.isRead).length ?? 0;

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 sm:mb-6 gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
              <Bell className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-foreground">通知中心</h1>
              <p className="text-muted-foreground text-xs sm:text-sm">
                {unreadCount > 0 ? `${unreadCount} 則未讀通知` : "所有通知已讀"}
              </p>
            </div>
          </div>
          <div className="flex gap-1.5 sm:gap-2 shrink-0">
            {unreadCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => markAllRead.mutate()}
                disabled={markAllRead.isPending}
                className="border-border text-muted-foreground hover:text-foreground text-xs h-8 px-2 sm:px-3"
              >
                <CheckCheck className="w-3 h-3 sm:mr-1.5" />
                <span className="hidden sm:inline">全部已讀</span>
              </Button>
            )}
          </div>
        </div>

        <Separator className="bg-zinc-800 mb-6" />

        {/* Notification List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-amber-400 animate-spin mr-2" />
            <span className="text-zinc-400">載入通知中...</span>
          </div>
        ) : !notifications || notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center">
              <BellOff className="w-7 h-7 text-zinc-500" />
            </div>
            <div className="text-center">
              <p className="text-zinc-300 font-medium mb-1">目前沒有通知</p>
              <p className="text-zinc-500 text-sm">執行篩選後，結果將以通知形式呈現</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map((notif: any) => (
              <Card
                key={notif.id}
                className={`p-4 border transition-all duration-200 cursor-pointer group ${
                  notif.isRead
                    ? "bg-zinc-900/50 border-zinc-800 hover:border-zinc-700"
                    : "bg-zinc-900 border-amber-500/30 hover:border-amber-500/50 shadow-[0_0_12px_rgba(245,158,11,0.05)]"
                }`}
                onClick={() => {
                  if (!notif.isRead) markRead.mutate({ id: notif.id });
                  if (notif.runId) navigate(`/history/${notif.runId}`);
                }}
              >
                <div className="flex items-start gap-3">
                  {/* Icon */}
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
                      notif.isRead ? "bg-zinc-800" : "bg-amber-500/10"
                    }`}
                  >
                    <TrendingUp
                      className={`w-4 h-4 ${notif.isRead ? "text-zinc-500" : "text-amber-400"}`}
                    />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <h3
                          className={`text-sm font-semibold ${
                            notif.isRead ? "text-zinc-300" : "text-white"
                          }`}
                        >
                          {notif.title}
                        </h3>
                        {!notif.isRead && (
                          <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span className="text-xs text-zinc-500">
                          {formatDistanceToNow(new Date(notif.createdAt), {
                            addSuffix: true,
                            locale: zhTW,
                          })}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteNotif.mutate({ id: notif.id });
                          }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-500/10 text-zinc-500 hover:text-red-400"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-zinc-400 mt-1 leading-relaxed line-clamp-2">
                      {notif.content}
                    </p>
                    {notif.runId && (
                      <div className="mt-2">
                        <Badge
                          variant="outline"
                          className="text-xs border-zinc-700 text-zinc-400 hover:border-amber-500/50 hover:text-amber-400 transition-colors"
                        >
                          查看詳細結果 →
                        </Badge>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
