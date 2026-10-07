#include <stdio.h>

int main(void) {
    int x, sum = 0;
    while (scanf("%d", &x) == 1) {
        sum += x;
    }
    printf("sum = %d\n", sum);
    return 0;
}
