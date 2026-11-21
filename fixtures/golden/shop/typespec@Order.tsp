import "@typespec/http";
import "@typespec/openapi";
using TypeSpec.Http;
using TypeSpec.OpenAPI;

@service(#{
  title: "Shop API"
})
@info(#{
  version: "2.1.0",
})
@doc("""
  Orders, customers and deliveries.  
  A second line follows directly.
  
  A new paragraph.
  
  &nbsp;  
  &nbsp;  
  After extra blank lines.
  """)
namespace Shop;

@doc("Created")
model CreateOrderResponse201 {
  @statusCode statusCode: 201;
  @body body: Result;
}

@doc("Invalid order")
model CreateOrderResponse400 {
  @statusCode statusCode: 400;
  @body body: Error;
}

/**
 * Creates an order.  
 * Idempotent per X-Request-Id.
 *
 * &nbsp;  
 * See the guide.
 */
@tag("orders")
@tag("checkout")
@opExample(
  #{
    parameters: #{
      X-Request-Id: "req-1",
      dryRun: true,
      body: #{
        orderId: "ORD-0001",
        createdAt: "2026-01-02T03:04:05Z",
        total:  149.95 ,
        quantity: 3,
        giftWrap: "TRUE",
        channel: Channel.Web,
        status: "01",
        tags: #[
          "rush",
          "fragile"
        ],
        ratings: #[
          4.5,
          x,
          1e3
        ],
        customer: #{
          entityType: "privatePerson",
          name: "Ada <Lovelace> & co",
          birthDate: plainDate.fromISO("1990-12-10")
        },
        lines: #[
          #{
            product: "SKU-1",
            quantity: 2,
            unitPrice: 9.99,
            big: 9007199254740993
          }
        ],
        delivery: #{
          street: "Main St",
          houseNumber: 12,
          city: "Springfield"
        }
      }
    },
    returnType: #{
      statusCode: 201,
      body: #{
        id: "R-1",
        accepted: "true",
        warnings: #[
]
      }
    }
  },
  #{ title: "A basic order with one line" }
)
@opExample(
  #{
    parameters: #{
      X-Request-Id: "example",
      dryRun: true,
      body: #{
        orderId: "ORD-0002",
        total: 1.0,
        quantity: 1e3,
        giftWrap: false,
        customer: #{
          entityType: "company",
          name: "Acme",
          registrationNumber: "12345678"
        },
        lines: #[
],
        items: #[
          #{
            entityType: "car",
            make: "Volvo"
          },
          #{
            entityType: "bicycle",
            frameSize: 54
          }
        ],
        fees: #[
          #{
            entityType: "shipping",
            amount: 4.95,
            carrier: "DHL"
          }
        ],
        note: "multi\nline"
      }
    },
    returnType: #{
      statusCode: 400,
      body: #{
        code: "E42",
        message: "Total too high",
        details: #[
          "a",
          "b"
        ]
      }
    }
  },
  #{ title: "Company order, it's \"urgent\"" }
)
@opExample(
  #{
    parameters: #{
      X-Request-Id: "example",
      dryRun: true,
      body: #{
        orderId: "ORD-0003",
        total: 1_000,
        quantity: +5,
        lines: #[
          #{
            quantity: 7,
            unitPrice: Inf
          }
        ],
        giftWrap: "yes"
      }
    },
  },
  #{ title: "Numbers that are numbers only to some readers" }
)
@route("/orders")
@post
op createOrder(@header X-Request-Id: string, @query dryRun: boolean, @body body: Order): CreateOrderResponse201 | CreateOrderResponse400;

@doc("The order")
model GetOrderResponse200 {
  @statusCode statusCode: 200;
  @body body: Order;
}

@doc("Not found")
model GetOrderResponse404 {
  @statusCode statusCode: 404;
  @body body: Error;
}

@tag("orders")
@opExample(
  #{
    returnType: #{
      statusCode: 200,
      body: #{
        orderId: "ORD-0001",
        total: 10,
        customer: #{
          entityType: "company",
          name: "Acme"
        }
      }
    }
  },
  #{ title: "Fetch" }
)
@opExample(
  #{
    returnType: #{
      statusCode: 404,
      body: #{
        code: "E404",
        message: "No such order"
      }
    }
  },
  #{ title: "Missing" }
)
@route("/orders/{orderId}")
@get
op getOrder(@path orderId: string): GetOrderResponse200 | GetOrderResponse404;

@doc("One result per document")
model PutAttachmentsResponse207 {
  @statusCode statusCode: 207;
  @body body: Result[];
}

@doc("Too large")
model PutAttachmentsResponse413 {
  @statusCode statusCode: 413;
  @body body: Error;
}

@tag("documents")
@opExample(
  #{
    parameters: #{
      orderId: "ORD-0001",
      body: #[
        #{
          fileName: "a.pdf",
          content: "JVBERi0=",
          kind: "invoice"
        }
      ]
    },
    returnType: #{
      statusCode: 207,
      body: #[
        #{
          id: "D-1",
          accepted: "TRUE"
        }
      ]
    }
  },
  #{ title: "Single document, wrapped into an array" }
)
@opExample(
  #{
    parameters: #{
      orderId: "example",
      body: #[
        #{
          fileName: "a.pdf",
          content: "AA=="
        },
        #{
          fileName: "b.pdf",
          content: "BB=="
        }
      ]
    },
    returnType: #{
      statusCode: 207,
      body: #[
        #{
          id: "D-2",
          accepted: "false"
        }
      ]
    }
  },
  #{ title: "Two documents" }
)
@route("/orders/{orderId}/documents")
@put
op putAttachments(@path orderId: string, @body body: Document[]): PutAttachmentsResponse207 | PutAttachmentsResponse413;

@doc("Channels")
model ListChannelsResponse200 {
  @statusCode statusCode: 200;
  @body body: Result;
}

@opExample(
  #{
    returnType: #{
      statusCode: 200,
      body: #{
        id: "x",
        nested: #{
          10: 1,
          9: 2,
          z: 12345678901234567890,
          a: -0,
          b: 1.50
        }
      }
    }
  },
  #{ title: "Literals as written" }
)
@route("/channels")
@get
op listChannels(@query sort: SortOrder): ListChannelsResponse200;

@doc("Sales channel.")
@extension("x-schema-group", "codelist")
enum Channel {
  @doc("Orders placed online.")
  Web: "web",
  InStore: "store",
  PhoneOrder: "phone_order"
}

@doc("Garment size.")
@extension("x-schema-group", "codelist")
enum Size {
  S: "S",
  @doc("Medium")
  M: "M",
  ��lan: "x-large"
}

@doc("""
  Order status

  | Code | Description |
  |------|-------------|
  | 01 | Open |
  | 10 | Shipped |
  """)
@extension("x-schema-group", "codelist")
@extension("x-sivi-code", "STA002")
union OrderStatus {
  "01",
  "10"
}

@doc("""
  Colours

  | Code | Description | Notes |
  |------|-------------|-------|
  | 01 | Red |  |
  | 02 | Green | Discontinued |
  | 10 | Blue & white | Seasonal <limited> & rare |
  | 9 | Black |  |
  | A | Any |  |
  """)
@extension("x-schema-group", "codelist")
@extension("x-sivi-code", "CLR001")
union Colour {
  "01",
  "02",
  "10",
  "9",
  "A"
}

@doc("""
  | Code | Description |
  |------|-------------|
  | card |  |
  | cash | Cash |
  """)
@extension("x-schema-group", "codelist")
@extension("x-sivi-code", "PAY003")
union PAY003 {
  "card",
  "cash"
}

@extension("x-schema-group", "codelist")
union OrderLineChannelSubset {
  "web"
}

@doc("""
  No codes yet

  | Code | Description |
  |------|-------------|
  """)
@extension("x-schema-group", "codelist")
@extension("x-sivi-code", "EMPTY4")
union EMPTY4 {
}

@pattern("^[a-z]+$")
@maxLength(20)
scalar OrderTags extends string;

@minValue(0.5)
@maxValue(1000000000000000000000)
scalar OrderRatings extends float64;

/**
 * A customer's order.  
 * It holds lines and a delivery.
 */
model Order {
  @doc("Identifier chosen by the client.")
  @example("ORD-0001")
  @pattern("^[A-Z]{3}-\\d{4}$")
  @minLength(8)
  @maxLength(8)
  orderId: string;
  @example("2026-01-02T03:04:05Z")
  createdAt: utcDateTime;
  @doc("Requested date.")
  @example(plainDate.fromISO("2026-02-01"))
  deliveryDate?: plainDate;
  @doc("Total in euros, it's \"gross\".")
  @example(149.95)
  @minValue(0)
  @maxValueExclusive(1000000)
  total: float64;
  @doc("Number of items.")
  @example(3)
  @minValue(1)
  @maxValue(99)
  quantity?: int32 = 1;
  @doc("Wrap as a gift.")
  @example(false)
  giftWrap?: boolean = true;
  @doc("Codelist: Channel. Where the order came from.")
  @example(Channel.Web)
  channel: Channel;
  @doc("Codelist: OrderStatus. Status.")
  @example("01")
  @extension("x-sivi-code", "STA002")
  status: OrderStatus;
  @doc("Codelist: Colour. Preferred colour.")
  @extension("x-sivi-code", "CLR001")
  colour?: Colour;
  @doc("Free tags.")
  @example(#["rush"])
  @minItems(1)
  @maxItems(5)
  tags?: OrderTags[];
  @doc("Codelist: Size.")
  sizes?: Size[];
  @doc("Ratings.")
  @example(#["4.5"])
  @minItems(0)
  ratings?: OrderRatings[];
  customer: Party;
  @doc("Order lines.")
  @minItems(1)
  lines: OrderLine[];
  delivery?: Address;
  items?: Asset[];
  fees?: Fee[];
}

@doc("One product line.")
model OrderLine {
  @doc("Stock keeping unit.")
  @example("SKU-1")
  product: string;
  @example(2)
  quantity: int32;
  @example(9.99)
  unitPrice: float32;
  @minValueExclusive(0)
  @maxValue(100)
  discount?: float64 = 0.5;
  @doc("Codelist: Colour.")
  @example(#["02"])
  @extension("x-sivi-code", "CLR001")
  @minItems(1)
  colours?: Colour[];
  @doc("Codelist: PAY003.")
  @extension("x-sivi-code", "PAY003")
  altPayment?: PAY003;
  @doc("Codelist: OrderLineChannelSubset.")
  channelSubset?: OrderLineChannelSubset;
  @example(9007199254740993)
  big?: int64;
  ratio?: float64;
  @format("uuid")
  uid?: string;
  link?: url;
  @format("byte")
  blob?: string;
  @format("password")
  secret?: string;
  day?: plainDate;
}

model Address {
  // — Street —
  @doc("Street name.")
  @example("Main St")
  street: string;
  @doc("House number.")
  @example(12)
  houseNumber: int32;
  // — Location & region —
  @example("Springfield")
  city: string;
  @doc("Codelist: EMPTY4. Country code.")
  @extension("x-sivi-code", "EMPTY4")
  country?: EMPTY4;
}

@doc("An item in the order. Discriminated by the entityType property.")
@discriminated(#{ envelope: "none", discriminatorPropertyName: "entityType" })
union Asset {
  car: AssetCar,
  bicycle: AssetBicycle
}

@doc("EntityType: car. A motor car.")
model AssetCar {
  @doc("Kind of object.")
  entityType: "car";
  @doc("Brand.")
  @example("Volvo")
  make: string;
}

@doc("EntityType: bicycle. A bicycle.")
model AssetBicycle {
  @doc("Kind of object.")
  entityType: "bicycle";
  @doc("Frame size in cm.")
  @example(54)
  frameSize?: int32;
}

@doc("Problem details.")
model Error {
  @example("E42")
  code: string;
  message: string;
  details?: string[];
}

@doc("Discriminated by the entityType property.")
@discriminated(#{ envelope: "none", discriminatorPropertyName: "entityType" })
union Fee {
  shipping: FeeShipping,
  service: FeeService
}

@doc("Shared attributes of all Fee subtypes.")
model FeeBase {
  @example(4.95)
  amount: float64;
}

@doc("EntityType: shipping. Fee subtype: shipping")
model FeeShipping extends FeeBase {
  entityType: "shipping";
  carrier?: string;
}

@doc("EntityType: service. Fee subtype: service")
model FeeService extends FeeBase {
  entityType: "service";
}

@doc("Someone involved in an order. Discriminated by the entityType property.")
@discriminated(#{ envelope: "none", discriminatorPropertyName: "entityType" })
union Party {
  privatePerson: PartyPrivatePerson,
  company: PartyCompany
}

@doc("Shared attributes of all Party subtypes.")
model PartyBase {
  @doc("Full name.")
  @example("Ada")
  @maxLength(100)
  name: string;
  @doc("Contact address.")
  @example("ada@example.com")
  @format("email")
  email?: string;
}

@doc("EntityType: privatePerson. A natural person.")
model PartyPrivatePerson extends PartyBase {
  @doc("Identifies the kind of party.")
  entityType: "privatePerson";
  @doc("Date of birth.")
  @example(plainDate.fromISO("1990-12-10"))
  birthDate?: plainDate;
  @doc("Codelist: PAY003. Payment method.")
  @extension("x-sivi-code", "PAY003")
  payment?: PAY003;
}

@doc("EntityType: company. A registered company (workspace text).")
model PartyCompany extends PartyBase {
  @doc("Identifies the kind of party.")
  entityType: "company";
  @doc("Chamber of commerce number.")
  @example("12345678")
  @pattern("^\\d{8}$")
  registrationNumber: string;
  @doc("Codelist: PAY003. Payment method.")
  @extension("x-sivi-code", "PAY003")
  payment?: PAY003;
}

@doc("Outcome of a request.")
model Result {
  @example("R-1")
  id: string;
  @example(true)
  accepted: boolean;
  warnings?: Error[];
}

