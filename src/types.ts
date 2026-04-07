export type UserRole = 'client' | 'driver' | 'admin';
export type UserStatus = 'pending_validation' | 'active' | 'suspended' | 'rejected' | 'pending_interview' | 'interview_scheduled';

export interface UserProfile {
  uid: string;
  email: string;
  role: UserRole;
  status: UserStatus;
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
  createdAt: any;
  validatedAt?: any;
  displayName?: string; // For compatibility with Firebase Auth
}

export type OrderStatus = 'awaiting_payment' | 'pending' | 'accepted' | 'at_market' | 'delivering' | 'delivered' | 'cancelled';

export interface OrderItem {
  tempId?: string;
  name: string;
  quantity: number;
  proposedPricePerUnit: number;
  total: number;
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
  createdAt: any;
}

export interface Review {
  id: string;
  orderId: string;
  driverId: string;
  userId: string;
  note: number;
  comment?: string;
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

export interface Product {
  id: string;
  name: string;
  category: string;
  image?: string;
  available: boolean;
  createdAt: any;
}
