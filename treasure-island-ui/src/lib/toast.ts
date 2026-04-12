import Swal from "sweetalert2";

export type ToastType = "success" | "error" | "info" | "warning";

export type ToastMessage = {
  id: string;
  type: ToastType;
  message: string;
};

type Listener = (t: ToastMessage) => void;
const listeners = new Set<Listener>();

/** Subscribe to toast events. Returns an unsubscribe function. */
export function onToast(cb: Listener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function toast(message: string, type: ToastType = "info") {
  // Emit to inline ToastContainer listeners
  const t: ToastMessage = { id: crypto.randomUUID(), type, message };
  listeners.forEach(cb => cb(t));

  // Also show sweetalert2 toast as fallback when no listeners are mounted
  if (listeners.size === 0) {
    Swal.fire({
      toast: true,
      position: "bottom-end",
      icon: type,
      title: message,
      showConfirmButton: false,
      timer: 4000,
      timerProgressBar: true,
      background: "#12121a",
      color: "#e8e8f0",
      iconColor:
        type === "success" ? "#2ecc71"
        : type === "error"   ? "#e74c3c"
        : type === "warning" ? "#f39c12"
        : "#60a5fa",
      customClass: { popup: "swal-toast-popup", title: "swal-toast-title" },
    });
  }
}
