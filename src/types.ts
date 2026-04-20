export type UserRole = 'client' | 'driver' | 'admin';
export type UserStatus = 'pending_email_verification' | 'pending_validation' | 'active' | 'suspended' | 'rejected' | 'pending_interview' | 'interview_scheduled';

export interface UserProfile {
  uid: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  verificationCode?: string;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  nom?: string;
  prenom?: string;
  phone?: string;
  address?: string;
  photoURL?: string;
  idCardPhotoUrl?: string;
  rejectionReason?: string;
  interviewDate?: any;
  interviewMessage?: string;
  interviewAddress?: string;
  interviewContactPhone?: string;
  interviewInvitation?: {
    date: string;
    time: string;
    message: string;
    address: string;
    status: 'pending' | 'accepted' | 'refused';
    sentAt: any;
  };
  currentLocation?: GeoPoint;
  noteMoyenne?: number;
  totalDeliveries?: number;
  solde?: number;
  totalGains?: number;
  createdAt: any;
  validatedAt?: any;
  displayName?: string; // For compatibility with Firebase Auth
  isDeleted?: boolean;
  active?: boolean;
  suspended?: boolean;
  deletedAt?: any;
}

export type OrderStatus = 'awaiting_payment' | 'pending' | 'accepted' | 'at_market' | 'shopping_completed' | 'delivering' | 'delivered' | 'cancelled' | 'disputed';

export interface OrderItem {
  tempId?: string;
  name: string;
  quantity: number;
  unit: string;
  proposedPricePerUnit: number;
  total: number;
}

export interface ItemValidation {
  itemId: string;
  clientApproved: boolean | null;
  clientRemark?: string;
  driverActualPrice: number;
  driverActualQuantity: number;
  proofPhotos: string[];
  proofVideoUrl?: string;
  proofLocation?: GeoPoint;
  proofTimestamp?: any;
  skippedProof?: boolean;
  skipJustification?: string;
}

export interface ChatMessage {
  senderId: string;
  senderRole: UserRole;
  text: string;
  timestamp: any;
  type: 'text' | 'image' | 'system';
  imageUrl?: string;
}

export interface Dispute {
  id: string;
  orderId: string;
  clientId: string;
  driverId: string;
  reason: string;
  status: 'pending' | 'resolved_validated' | 'resolved_partial_cancel' | 'resolved_total_cancel';
  adminDecision?: string;
  adminId?: string;
  createdAt: any;
  resolvedAt?: any;
}

export interface GeoPoint {
  latitude: number;
  longitude: number;
  address?: string;
  updatedAt?: string;
  accuracy?: number;
}

export interface Order {
  id: string;
  userId: string;
  driverId?: string;
  driverName?: string;
  marketName?: string;
  items: OrderItem[];
  itemsValidation?: { [key: string]: ItemValidation }; // Keyed by item index or tempId
  chatMessages?: ChatMessage[];
  subTotal: number;
  totalAmount: number;
  deliveryFee: number;
  status: OrderStatus;
  userLocation: GeoPoint;
  driverLocation?: GeoPoint;
  marketReachedLocation?: GeoPoint;
  marketReachedAt?: any;
  departureLocation?: GeoPoint;
  departureAt?: any;
  deliveredLocation?: GeoPoint;
  deliveredAt?: any;
  proofPhotos?: string[];
  proofStatus?: 'pending' | 'submitted' | 'approved' | 'rejected';
  createdAt: any;
  shoppingCompletedAt?: any;
  disputedAt?: any;
  disputeId?: string;
}

export interface Review {
  id: string;
  orderId: string;
  driverId: string;
  userId: string;
  note: number;
  commentaire?: string;
  createdAt: any;
}

export interface AdminNotification {
  id: string;
  type: 'new_driver_request' | 'order_alert';
  driverId?: string;
  driverName?: string;
  read: boolean;
  createdAt: any;
}

export interface AdminChatMessage {
  senderId: string;
  text: string;
  timestamp: any;
  read: boolean;
}

export interface AdminChat {
  id: string;
  participants: string[]; // [livreurId, adminId]
  livreurId: string;
  livreurName: string;
  livreurPhoto?: string;
  messages: AdminChatMessage[];
  lastMessage?: string;
  lastUpdated: any;
  unreadCountAdmin: number;
  unreadCountLivreur: number;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  image?: string;
  available: boolean;
  createdAt: any;
}

export interface AdminReport {
  id: string;
  month: string;
  year: number;
  stats: {
    newUsers: number;
    newDrivers: number;
    totalOrders: number;
    deliveredOrders: number;
    cancelledOrders: number;
    totalRevenue: number;
    disputesCount: number;
  };
  advice: string;
  createdAt: any;
}
