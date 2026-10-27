local cjson = require "cjson.safe"

local _M = {}

function _M.handle()
  

    local user_res, orders_res = ngx.location.capture_multi({
        { "/_internal/user/me", { ctx = ngx.ctx } },
        { "/_internal/orders",  { ctx = ngx.ctx } },
    })

    local result = { user = cjson.null, orders = cjson.null, errors = {} }

    if user_res.status == 200 then
        result.user = cjson.decode(user_res.body)
    else
        table.insert(result.errors, "user service: " .. user_res.status)
    end

    if orders_res.status == 200 then
        result.orders = cjson.decode(orders_res.body)
    else
        table.insert(result.errors, "order service: " .. orders_res.status)
    end

    if result.user == cjson.null then
        ngx.status = ngx.HTTP_BAD_GATEWAY
    end

    if #result.errors == 0 then result.errors = nil end
    ngx.header["Content-Type"] = "application/json"
    ngx.say(cjson.encode(result))
end

return _M
