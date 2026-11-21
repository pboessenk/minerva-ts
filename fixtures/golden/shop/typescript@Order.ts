// Shop API
// Orders, customers and deliveries.
// A second line follows directly.
//
// A new paragraph.
//
//
//
// After extra blank lines.
// Version: 2.1.0  Last Modified: 2026-01-02T03:04:05.000Z

// ── API Operations ──

/** POST /orders — Creates an order.
Idempotent per X-Request-Id.


See the guide. */
export declare function createOrder(X-Request-Id: string, dryRun: boolean, body: Order): Promise<Result>;

export declare function getOrder(orderId: string): Promise<Order>;

export declare function putAttachments(orderId: string, body: Document[]): Promise<Result[]>;

export declare function listChannels(sort: SortOrder): Promise<Result>;

/** Sales channel. */
export enum Channel {
  /** Orders placed online. */
  Web = 'web',
  InStore = 'store',
  PhoneOrder = 'phone_order',
}

/** Garment size. */
export enum Size {
  S = 'S',
  /** Medium */
  M = 'M',
  ��lan = 'x-large',
}

/**
 * Order status
 *
 * | Code | Description |
 * |------|-------------|
 * | 01 | Open |
 * | 10 | Shipped |
 */
export type OrderStatus = '01' | '10';

/**
 * Colours
 *
 * | Code | Description | Notes |
 * |------|-------------|-------|
 * | 01 | Red |  |
 * | 02 | Green | Discontinued |
 * | 10 | Blue & white | Seasonal <limited> & rare |
 * | 9 | Black |  |
 * | A | Any |  |
 */
export type Colour = '01' | '02' | '10' | '9' | 'A';

/**
 * | Code | Description |
 * |------|-------------|
 * | card |  |
 * | cash | Cash |
 */
export type PAY003 = 'card' | 'cash';

export type OrderLineChannelSubset = 'web';

/**
 * No codes yet
 *
 * | Code | Description |
 * |------|-------------|
 */
export type EMPTY4 = ;

/** A customer's order.
It holds lines and a delivery. */
export interface Order {
  /** Identifier chosen by the client. @example ORD-0001 @pattern ^[A-Z]{3}-\d{4}$ @minLength 8 @maxLength 8 */
  orderId: string; // SIVI: order.orderId
  /** @example 2026-01-02T03:04:05Z */
  createdAt: string;
  /** Requested date. @example 2026-02-01 */
  deliveryDate?: string; // SIVI: order.deliveryDate
  /** Total in euros, it's "gross". @example 149.95 @minimum 0 @exclusiveMaximum 1000000 */
  total: number;
  /** Number of items. @example 3 @minimum 1 @maximum 99 @default 1 */
  quantity?: number; // SIVI: order.quantity
  /** Wrap as a gift. @example False @default true */
  giftWrap?: boolean;
  /** Codelist: Channel. Where the order came from. @example web */
  channel: Channel;
  /** Codelist: OrderStatus. Status. @example 01 */
  status: OrderStatus; // SIVI: order.status
  /** Codelist: Colour. Preferred colour. */
  colour?: Colour;
  /** Free tags. @example rush @pattern ^[a-z]+$ @maxLength 20 @minItems 1 @maxItems 5 */
  tags?: string[];
  /** Codelist: Size. */
  sizes?: Size[];
  /** Ratings. @example 4.5 @minimum 0.5 @maximum 1000000000000000000000 @minItems 0 */
  ratings?: number[];
  customer: Party;
  /** Order lines. @minItems 1 */
  lines: OrderLine[];
  delivery?: Address;
  items?: Asset[];
  fees?: Fee[];
}

/** One product line. */
export interface OrderLine {
  /** Stock keeping unit. @example SKU-1 */
  product: string;
  /** @example 2 */
  quantity: number;
  /** @example 9.99 */
  unitPrice: number;
  /** @exclusiveMinimum 0 @maximum 100 @default 0.5 */
  discount?: number;
  /** Codelist: Colour. @example 02 @minItems 1 */
  colours?: Colour[];
  /** Codelist: PAY003. */
  altPayment?: PAY003;
  /** Codelist: OrderLineChannelSubset. */
  channelSubset?: OrderLineChannelSubset;
  /** @example 9007199254740993 */
  big?: number;
  ratio?: number;
  uid?: string;
  link?: string;
  blob?: string;
  secret?: string;
  day?: string;
}

export interface Address {
  // — Street —
  /** Street name. @example Main St */
  street: string; // SIVI: address.street
  /** House number. @example 12 */
  houseNumber: number; // SIVI: Address.HouseNumber
  // — Location & region —
  /** @example Springfield */
  city: string; // SIVI: address.city
  /** Codelist: EMPTY4. Country code. */
  country?: EMPTY4; // SIVI: address.country
}

/** An item in the order. */
export type Asset = AssetCar | AssetBicycle;

/** A motor car. */
export interface AssetCar {
  /** Kind of object. */
  entityType: 'car';
  /** Brand. @example Volvo */
  make: string; // SIVI: object.make
}

/** A bicycle. */
export interface AssetBicycle {
  /** Kind of object. */
  entityType: 'bicycle';
  /** Frame size in cm. @example 54 */
  frameSize?: number; // SIVI: object.frameSize
}

/** Problem details. */
export interface Error {
  /** @example E42 */
  code: string;
  message: string;
  details?: string[];
}

export type Fee = FeeShipping | FeeService;

/** Shared attributes of all Fee subtypes. */
export interface FeeBase {
  /** @example 4.95 */
  amount: number;
}

/** Fee subtype: shipping */
export interface FeeShipping extends FeeBase {
  entityType: 'shipping';
  carrier?: string;
}

/** Fee subtype: service */
export interface FeeService extends FeeBase {
  entityType: 'service';
}

/** Someone involved in an order. */
export type Party = PartyPrivatePerson | PartyCompany;

/** Shared attributes of all Party subtypes. */
export interface PartyBase {
  /** Full name. @example Ada @maxLength 100 */
  name: string; // SIVI: party.name
  /** Contact address. @example ada@example.com */
  email?: string; // SIVI: party.email
}

/** A natural person. */
export interface PartyPrivatePerson extends PartyBase {
  /** Identifies the kind of party. */
  entityType: 'privatePerson';
  /** Date of birth. @example 1990-12-10 */
  birthDate?: string; // SIVI: party.birthDate
  /** Codelist: PAY003. Payment method. */
  payment?: PAY003; // SIVI: party.payment
}

/** A registered company (workspace text). */
export interface PartyCompany extends PartyBase {
  /** Identifies the kind of party. */
  entityType: 'company';
  /** Chamber of commerce number. @example 12345678 @pattern ^\d{8}$ */
  registrationNumber: string; // SIVI: party.registrationNumber
  /** Codelist: PAY003. Payment method. */
  payment?: PAY003; // SIVI: party.payment
}

/** Outcome of a request. */
export interface Result {
  /** @example R-1 */
  id: string;
  /** @example true */
  accepted: boolean;
  warnings?: Error[];
}

// ── Operation Examples ──

/** A basic order with one line */
export const basicOrder: Order = {
  "orderId": "ORD-0001",
  "createdAt": "2026-01-02T03:04:05Z",
  "total":  149.95 ,
  "quantity": 3,
  "giftWrap": true,
  "channel": Channel.Web,
  "status": "01",
  "tags": [
    "rush",
    "fragile"
  ],
  "ratings": [
    4.5,
    x,
    1e3
  ],
  "customer": {
    "entityType": "privatePerson",
    "name": "Ada <Lovelace> & co",
    "birthDate": "1990-12-10"
  },
  "lines": [
    {
      "product": "SKU-1",
      "quantity": 2,
      "unitPrice": 9.99,
      "big": 9007199254740993
    }
  ],
  "delivery": {
    "street": "Main St",
    "houseNumber": 12,
    "city": "Springfield"
  }
};

export const basicOrderResponse: Result = {
  "id": "R-1",
  "accepted": true,
  "warnings": [
]
};

/** Company order, it's "urgent" */
export const company-order: Order = {
  "orderId": "ORD-0002",
  "total": 1.0,
  "quantity": 1e3,
  "giftWrap": false,
  "customer": {
    "entityType": "company",
    "name": "Acme",
    "registrationNumber": "12345678"
  },
  "lines": [
],
  "items": [
    {
      "entityType": "car",
      "make": "Volvo"
    },
    {
      "entityType": "bicycle",
      "frameSize": 54
    }
  ],
  "fees": [
    {
      "entityType": "shipping",
      "amount": 4.95,
      "carrier": "DHL"
    }
  ],
  "note": "multi
line"
};

export const company-orderResponse: Error = {
  "code": "E42",
  "message": "Total too high",
  "details": [
    "a",
    "b"
  ]
};

/** Numbers that are numbers only to some readers */
export const odd-numbers: Order = {
  "orderId": "ORD-0003",
  "total": 1_000,
  "quantity": +5,
  "lines": [
    {
      "quantity": 7,
      "unitPrice": Inf
    }
  ],
  "giftWrap": yes
};

/** Nothing filled in */
/** Fetch */
export const fetchOrderResponse: Order = {
  "orderId": "ORD-0001",
  "total": 10,
  "customer": {
    "entityType": "company",
    "name": "Acme"
  }
};

/** Missing */
export const fetch-missingResponse: Error = {
  "code": "E404",
  "message": "No such order"
};

/** Single document, wrapped into an array */
export const attach-one: Document[] = [
  {
    "fileName": "a.pdf",
    "content": "JVBERi0=",
    "kind": "invoice"
  }
];

export const attach-oneResponse: Result[] = [
  {
    "id": "D-1",
    "accepted": true
  }
];

/** Two documents */
export const attach-two: Document[] = [
  {
    "fileName": "a.pdf",
    "content": "AA=="
  },
  {
    "fileName": "b.pdf",
    "content": "BB=="
  }
];

export const attach-twoResponse: Result[] = [
  {
    "id": "D-2",
    "accepted": false
  }
];

/** Literals as written */
export const raw-literalsResponse: Result = {
  "id": "x",
  "nested": {
    "10": 1,
    "9": 2,
    "z": 12345678901234567890,
    "a": -0,
    "b": 1.50
  }
};

