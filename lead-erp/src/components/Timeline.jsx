import { Phone, MessageCircle, MessageSquare, RefreshCw, UserCheck, Clock } from "lucide-react";
import { fmtDuration } from "../utils/helpers";

export default function Timeline({ entries = [] }) {
  // Timeline ko latest activity ke hisaab se sort karo
  const sorted = [...entries].sort((a, b) => new Date(b.at || b.createdAt) - new Date(a.at || a.createdAt));

  if (!sorted.length) {
    return <p className="text-gray-400 text-sm text-center mt-10">No activity logged yet.</p>;
  }

  // Type ke hisaab se sahi icon aur color return karna
  const getIcon = (type) => {
    if (type === 'worknote') return <MessageSquare size={16} className="text-blue-500" />;
    if (type === 'status' || type === 'status_change') return <RefreshCw size={16} className="text-orange-500" />;
    if (type === 'assignment') return <UserCheck size={16} className="text-green-500" />;
    if (type === 'call') return <Phone size={16} className="text-emerald-600" />;
    if (type === 'whatsapp') return <MessageCircle size={16} className="text-teal-500" />;
    return <Clock size={16} className="text-gray-500" />;
  };

  return (
    <div className="space-y-6 pr-2">
      {sorted.map((act, index) => {
        // Data format check (Local DB vs Firebase compatibility)
        const isPrivate = act.visibility === 'admin_only' || act.metadata?.visibility === 'admin_only';
        const duration = act.duration ?? act.metadata?.duration;
        const authorName = act.authorName || act.by || "System";
        const authorRole = act.authorRole || "";
        const timestamp = act.at || act.createdAt;

        return (
          <div key={index} className="flex gap-4">
            {/* Icon Circle */}
            <div className="mt-1 bg-gray-100 p-2 rounded-full h-8 w-8 flex items-center justify-center shrink-0 border border-gray-200">
              {getIcon(act.type)}
            </div>
            
            {/* Activity Box */}
            <div className={`rounded-lg p-3 flex-1 border ${isPrivate ? 'bg-yellow-50 border-yellow-300' : 'bg-gray-50 border-gray-200'}`}>
              
              <div className="flex justify-between items-start mb-1">
                <span className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                  {authorName} 
                  {authorRole && <span className="text-xs text-gray-400 font-normal">({authorRole})</span>}
                  
                  {/* Private Badge for Admin */}
                  {isPrivate && (
                    <span className="text-[10px] bg-yellow-200 text-yellow-800 px-2 py-0.5 rounded-full font-medium">
                      Private
                    </span>
                  )}
                </span>
                <span className="text-xs text-gray-400 shrink-0">
                  {timestamp ? new Date(timestamp).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : ""}
                </span>
              </div>
              
              {/* Message Text */}
              <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{act.text}</p>
              
              {/* Call Duration Tracker */}
              {duration != null && (
                <p className="text-xs text-emerald-600 font-medium mt-2 flex items-center gap-1.5 bg-emerald-50 w-fit px-2 py-1 rounded border border-emerald-100">
                  <Phone size={10} /> Call Duration: {fmtDuration(duration)}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}