FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY *.go ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /tobs-relay . && mkdir /data

FROM scratch
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=build /tobs-relay /tobs-relay
COPY --from=build --chown=1000:1000 /data /data
ENV RELAY_DATA=/data RELAY_CONFIG_DIR=/data
WORKDIR /data
USER 1000:1000
VOLUME ["/data"]
EXPOSE 80 443
HEALTHCHECK --interval=30s --timeout=5s CMD ["/tobs-relay", "health"]
ENTRYPOINT ["/tobs-relay"]
CMD ["serve"]
