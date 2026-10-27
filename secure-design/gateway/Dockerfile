FROM openresty/openresty:1.25.3.2-alpine-fat
RUN opm get cdbattags/lua-resty-jwt
COPY nginx.conf /usr/local/openresty/nginx/conf/nginx.conf
COPY lua/ /usr/local/openresty/nginx/lua/
