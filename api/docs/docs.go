// Package docs registers the OpenAPI 2.0 document for Swagger UI (GET /swagger/*).
package docs

import (
	_ "embed"

	"github.com/swaggo/swag"
)

//go:embed swagger.json
var swaggerJSON string

// SwaggerInfo is registered with swag for fiber-swagger (doc.json).
var SwaggerInfo = &swag.Spec{
	Version:          "1.0",
	Host:             "localhost:8080",
	BasePath:         "/",
	Title:            "Kurator API",
	Description:      "REST API for Kurator.",
	InfoInstanceName: "swagger",
	SwaggerTemplate:  swaggerJSON,
}

func init() {
	swag.Register(SwaggerInfo.InstanceName(), SwaggerInfo)
}
