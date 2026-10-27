-- Offloading: verify JWT của client tại gateway, rồi ký TOKEN NỘI BỘ cho service phía sau.
-- Token nội bộ: RS256, aud = đúng 1 service, sống 60s. Service chỉ có public key nên
-- không ai trong mạng nội bộ tự ký được token, kể cả service khác.
local jwt        = require "resty.jwt"
local validators = require "resty.jwt-validators"
local cjson      = require "cjson.safe"
local lrucache   = require "resty.lrucache"

local _M = {}

local CLIENT_SECRET = os.getenv("JWT_SECRET")
local INTERNAL_ISS  = "api-gateway"
local INTERNAL_TTL  = 60

local CACHE_TTL     = INTERNAL_TTL / 2
local token_cache   = assert(lrucache.new(10000))   
local function read_file(path)
    local f = assert(io.open(path, "r"))
    local data = f:read("*a")
    f:close()
    return data
end

local INTERNAL_KEY = read_file("/keys/internal.key")

local claim_spec = {
    exp = validators.required(validators.is_not_expired()),
}

local function deny(reason)
    ngx.status = ngx.HTTP_UNAUTHORIZED
    ngx.header["Content-Type"] = "application/json"
    ngx.say(cjson.encode({ error = "unauthorized", reason = reason }))
    return ngx.exit(ngx.HTTP_UNAUTHORIZED)
end

local function attach_internal_token(claims, aud)
    local key = claims.sub .. "|" .. claims.role .. "|" .. aud
    local token = token_cache:get(key)
    if not token then
        local now = ngx.time()
        token = jwt:sign(INTERNAL_KEY, {
            header  = { typ = "JWT", alg = "RS256" },
            payload = {
                iss = INTERNAL_ISS, aud = aud,
                sub = claims.sub, role = claims.role,
                iat = now, exp = now + INTERNAL_TTL,
            },
        })
        token_cache:set(key, token, CACHE_TTL)
    end
    ngx.req.set_header("Authorization", "Bearer " .. token)
end


function _M.verify(aud)
    local auth  = ngx.var.http_authorization or ""
    local token = auth:match("^Bearer%s+(.+)$")
    if not token then return deny("missing bearer token") end

    local obj = jwt:verify(CLIENT_SECRET, token, claim_spec)
    if not obj.verified then return deny(obj.reason) end

    if obj.header.alg ~= "HS256" then return deny("unexpected alg") end

    local claims = {
        sub  = tostring(obj.payload.sub),
        role = tostring(obj.payload.role or "user"),
    }
    ngx.ctx.claims = claims
    if aud then attach_internal_token(claims, aud) end
end

function _M.forward(aud)
    local claims = ngx.ctx.claims
    if not claims then return ngx.exit(ngx.HTTP_UNAUTHORIZED) end
    attach_internal_token(claims, aud)
end

return _M
