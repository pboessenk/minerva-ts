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
        total: " 149.95 ",
        quantity: "3",
        giftWrap: "TRUE",
        channel: "web",
        status: "01",
        tags: #[
          "rush",
          "fragile"
        ],
        ratings: #[
          "4.5",
          "x",
          "1e3"
        ],
        customer: #{
          entityType: "privatePerson",
          name: "Ada <Lovelace> & co",
          birthDate: "1990-12-10"
        },
        lines: #[
          #{
            product: "SKU-1",
            quantity: "2",
            unitPrice: "9.99",
            big: "9007199254740993"
          }
        ],
        delivery: #{
          street: "Main St",
          houseNumber: "12",
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
            frameSize: "54"
          }
        ],
        fees: #[
          #{
            entityType: "shipping",
            amount: "4.95",
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
        total: "1_000",
        quantity: "+5",
        lines: #[
          #{
            quantity: "7",
            unitPrice: "Inf"
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

@doc("Problem details.")
model Error {
  @example("E42")
  code: string;
  message: string;
  details?: string[];
}

@doc("Outcome of a request.")
model Result {
  @example("R-1")
  id: string;
  @example(true)
  accepted: boolean;
  warnings?: Error[];
}

