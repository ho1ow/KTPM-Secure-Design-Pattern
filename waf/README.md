WAF cho Juice Shop

Payload SQL injection: email `' OR 1=1--`, mật khẩu bất kỳ.

- Đăng nhập vào Juice Shop qua WAF (http://localhost:8080):
 nhận thấy bị chặn (403), log WAF ghi luật 942100 (SQL injection)

    ![Qua WAF bị chặn](poc/sql_rule.png)

- Đăng nhập vào Juice Shop thẳng (http://localhost:3000):
 nhận thấy thành công (200)

    ![Không qua WAF thành công](poc/no_waf.png)
