import { Controller, All, Req, Res, HttpStatus } from "@nestjs/common";
import { Request, Response } from "express";
import { ConfigService } from "@nestjs/config";
import axios, { AxiosRequestConfig } from "axios";

@Controller()
export class GatewayController {
  private readonly serviceMap: Record<string, string>;

  constructor(private configService: ConfigService) {
    this.serviceMap = {
      auth: this.configService.get<string>("AUTH_SERVICE_URL")!,
      users: this.configService.get<string>("USER_SERVICE_URL")!,
      friends: this.configService.get<string>("USER_SERVICE_URL")!,
      profile: this.configService.get<string>("USER_SERVICE_URL")!,
      chat: this.configService.get<string>("CHAT_SERVICE_URL")!,
      notifications: this.configService.get<string>(
        "NOTIFICATION_SERVICE_URL",
      )!,
    };
  }

  @All("*")
  async proxy(@Req() req: Request, @Res() res: Response) {
    // Robust path extraction
    const fullPathRaw = req.params[0] || req.params["path"] || "";
    const pathString = Array.isArray(fullPathRaw)
      ? fullPathRaw.join("/")
      : fullPathRaw;
    const segments = (pathString || "").split("/").filter(Boolean);

    const service = segments[0];
    const path = segments.slice(1).join("/");

    if (!service) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        statusCode: 400,
        message: "Service name is required",
      });
    }

    const targetUrlBase = this.serviceMap[service];

    if (!targetUrlBase) {
      return res.status(HttpStatus.NOT_FOUND).json({
        statusCode: 404,
        message: `Service '${service}' not found or not configured in Gateway`,
      });
    }

    const targetUrl = path
      ? `${targetUrlBase}/api/v1/${service}/${path}`
      : `${targetUrlBase}/api/v1/${service}`;

    // Handle multipart/form-data for file uploads
    const isMultipart = req.headers["content-type"]?.includes(
      "multipart/form-data",
    );

    try {
      const axiosConfig: AxiosRequestConfig = {
        method: req.method,
        url: targetUrl,
        headers: {
          ...req.headers,
          host: new URL(targetUrlBase).host,
        },
        params: req.query,
        validateStatus: () => true,
        maxRedirects: 0,
        withCredentials: true,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 30000, // 30s timeout to prevent infinite pending
      };

      if (isMultipart) {
        axiosConfig.data = req;
      } else if (req.body && Object.keys(req.body).length > 0) {
        axiosConfig.data = req.body;
      }

      // Remove content-length if we are passing the body/stream to let axios recalculate it
      if (axiosConfig.data && axiosConfig.headers) {
        delete axiosConfig.headers["content-length"];
      }

      const response = await axios(axiosConfig);

      // Forward headers
      Object.entries(response.headers).forEach(([key, value]) => {
        if (key === "set-cookie" && Array.isArray(value)) {
          res.setHeader(key, value);
        } else if (key !== "transfer-encoding" && key !== "content-length") {
          res.setHeader(key, value as string);
        }
      });

      // Ensure CORS headers are handled
      res.setHeader(
        "Access-Control-Allow-Origin",
        this.configService.get<string>("CORS_ORIGIN")!,
      );
      res.setHeader("Access-Control-Allow-Credentials", "true");

      return res.status(response.status).send(response.data);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        return res.status(error.response.status).json(error.response.data);
      }

      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        statusCode: 500,
        message: `Error communicating with ${service} service`,
        error: errorMessage,
      });
    }
  }
}
