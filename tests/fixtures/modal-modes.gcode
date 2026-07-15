; M109 in a comment must not count
N1 G21*41
G90
M82
G1 X0 Y0 Z.5 F600
G1 X10 E1
G1 Y5 E1 ; positive absolute E is not automatically extrusion
G92 E0
g1 x15 e.5
M83
G1 X20 E-0.2 ; retract
G1 X25 E0.2 ; unretract
G91
G1 X-5 Y+2 E.4 F1200
X5 E.3 ; modal G1 continuation
G20
G1 X1 E.1 F60
G21
G90
M82
G92 X0 Y0 Z0 E0
G1 E2 F120 ; E-only prime
G1 X0 Y0 Z0 E2 ; zero-length move
(M140 S60 is also only a comment)
m104 s0
M84
