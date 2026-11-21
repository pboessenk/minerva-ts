import "@typespec/http";
import "@typespec/openapi";
using TypeSpec.Http;
using TypeSpec.OpenAPI;

@doc("A note.")
model Note {
  text: string;
  pinned?: boolean = false;
}

