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

export declare function putAttachments(orderId: string, body: Document[]): Promise<Result[]>;

export declare function listChannels(sort: SortOrder): Promise<Result>;

/** Kind of document. */
export enum DocumentKind {
  Invoice = 'invoice',
  Receipt = 'receipt',
}

/** An attachment. */
export interface Document {
  /** @example invoice.pdf @maxLength 255 */
  fileName: string;
  /** Base64 content. */
  content: string;
  /** Codelist: DocumentKind. @example invoice */
  kind?: DocumentKind;
}

/** Problem details. */
export interface Error {
  /** @example E42 */
  code: string;
  message: string;
  details?: string[];
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
  "total": " 149.95 ",
  "quantity": "3",
  "giftWrap": "TRUE",
  "channel": "web",
  "status": "01",
  "tags": [
    "rush",
    "fragile"
  ],
  "ratings": [
    "4.5",
    "x",
    "1e3"
  ],
  "customer": {
    "entityType": "privatePerson",
    "name": "Ada <Lovelace> & co",
    "birthDate": "1990-12-10"
  },
  "lines": [
    {
      "product": "SKU-1",
      "quantity": "2",
      "unitPrice": "9.99",
      "big": "9007199254740993"
    }
  ],
  "delivery": {
    "street": "Main St",
    "houseNumber": "12",
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
      "frameSize": "54"
    }
  ],
  "fees": [
    {
      "entityType": "shipping",
      "amount": "4.95",
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
  "total": "1_000",
  "quantity": "+5",
  "lines": [
    {
      "quantity": "7",
      "unitPrice": "Inf"
    }
  ],
  "giftWrap": "yes"
};

/** Nothing filled in */
/** Single document, wrapped into an array */
export const attach-one: Document[] = [
  {
    "fileName": "a.pdf",
    "content": "JVBERi0=",
    "kind": DocumentKind.Invoice
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

