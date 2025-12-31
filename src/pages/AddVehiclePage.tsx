/* eslint-disable @typescript-eslint/no-explicit-any */
// import { useState, FormEvent } from "react";
// import { useNavigate, Link } from "react-router-dom";
// import { useAddVehicle } from "../api";
// import { VehicleCreate } from "../types"; // Use the specific type for creation

// // shadcn/ui components
// import { Button } from "@/components/ui/button";
// import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
// import { Input } from "@/components/ui/input";
// import { Label } from "@/components/ui/label";
// import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
// import { Separator } from "@/components/ui/separator"; // Import Separator
// import {
//   Breadcrumb,
//   BreadcrumbItem,
//   BreadcrumbLink,
//   BreadcrumbList,
//   BreadcrumbPage,
//   BreadcrumbSeparator,
// } from "@/components/ui/breadcrumb"; // Import Breadcrumb components

// // lucide-react icons
// import { PlusCircle, AlertTriangle, Save, XCircle, Car, Loader2, Gauge, CalendarDays } from "lucide-react";

// // Define a type for the form state for clarity
// interface VehicleFormData {
//   make: string;
//   model: string;
//   year: string; // Keep as string for input control
//   vin: string;
//   initial_mileage: string;
//   acquisition_date: string;
// }

// export function AddVehiclePage() {
//   // Renamed component
//   const navigate = useNavigate();
//   const [formData, setFormData] = useState<VehicleFormData>({
//     make: "",
//     model: "",
//     year: "",
//     vin: "",
//     initial_mileage: "",
//     acquisition_date: "",
//   });
//   const [validationErrors, setValidationErrors] = useState<Record<string, string[]>>({});
//   const addVehicle = useAddVehicle();

//   const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
//     const { name, value } = e.target;
//     setFormData((prev) => ({ ...prev, [name]: value }));
//     if (validationErrors[name]) {
//       setValidationErrors((prev) => {
//         const newErrors = { ...prev };
//         delete newErrors[name];
//         return newErrors;
//       });
//     }
//   };

//   const getFieldError = (fieldName: keyof VehicleFormData): string | undefined => {
//     return validationErrors[fieldName]?.join(", ");
//   };

//   const handleSubmit = async (e: FormEvent) => {
//     e.preventDefault();
//     setValidationErrors({});

//     const payload: VehicleCreate = {
//       make: formData.make.trim(),
//       model: formData.model.trim(),
//       year: formData.year ? parseInt(formData.year, 10) : undefined,
//       vin: formData.vin.trim() || undefined,
//       initial_mileage: formData.initial_mileage.trim() === "" ? undefined : parseInt(formData.initial_mileage, 10),
//       acquisition_date: formData.acquisition_date.trim() === "" ? undefined : formData.acquisition_date,
//     };

//     addVehicle.mutate(payload, {
//       onSuccess: () => {
//         navigate("/vehicles", { state: { message: "Vehicle added successfully!" } });
//       },
//       onError: (err: any) => {
//         const errorResponse = err?.response;
//         if (errorResponse?.status === 422 && errorResponse?.data?.detail) {
//           const backendErrors: Record<string, string[]> = {};
//           errorResponse.data.detail.forEach((detail: any) => {
//             const fieldKey = detail.loc.length > 1 ? detail.loc[1] : "general";
//             if (!backendErrors[fieldKey]) backendErrors[fieldKey] = [];
//             backendErrors[fieldKey].push(detail.msg);
//           });
//           setValidationErrors(backendErrors);
//         }
//       },
//     });
//   };

//   return (
//     <div className="p-4 md:p-6 max-w-lg mx-auto">
//       <Breadcrumb className="mb-6">
//         <BreadcrumbList>
//           <BreadcrumbItem>
//             <BreadcrumbLink asChild>
//               <Link to="/vehicles">Vehicles</Link>
//             </BreadcrumbLink>
//           </BreadcrumbItem>
//           <BreadcrumbSeparator />
//           <BreadcrumbItem>
//             <BreadcrumbPage>Add New Vehicle</BreadcrumbPage>
//           </BreadcrumbItem>
//         </BreadcrumbList>
//       </Breadcrumb>

//       <Card className="pb-0">
//         <CardHeader>
//           <div className="flex items-center gap-3 mb-1">
//             <Car className="h-7 w-7 text-primary" />
//             <CardTitle className="text-2xl">Add New Vehicle</CardTitle>
//           </div>
//           <CardDescription>Enter the details of the vehicle you want to track.</CardDescription>
//         </CardHeader>
//         <form onSubmit={handleSubmit}>
//           <CardContent className="space-y-5 pb-5">
//             {addVehicle.error && !Object.keys(validationErrors).length && (
//               <Alert variant="destructive">
//                 <AlertTriangle className="h-4 w-4" />
//                 <AlertTitle>Error</AlertTitle>
//                 <AlertDescription>{addVehicle.error.message}</AlertDescription>
//               </Alert>
//             )}

//             <div className="space-y-1.5">
//               <Label htmlFor="make">Make *</Label>
//               <Input
//                 id="make"
//                 name="make"
//                 placeholder="e.g., Toyota"
//                 value={formData.make}
//                 onChange={handleChange}
//                 aria-invalid={!!getFieldError("make")}
//                 aria-describedby={getFieldError("make") ? "make-error" : undefined}
//                 required
//               />
//               {getFieldError("make") && (
//                 <p id="make-error" className="text-xs text-destructive">
//                   {getFieldError("make")}
//                 </p>
//               )}
//             </div>

//             <div className="space-y-1.5">
//               <Label htmlFor="model">Model *</Label>
//               <Input
//                 id="model"
//                 name="model"
//                 placeholder="e.g., Camry"
//                 value={formData.model}
//                 onChange={handleChange}
//                 aria-invalid={!!getFieldError("model")}
//                 aria-describedby={getFieldError("model") ? "model-error" : undefined}
//                 required
//               />
//               {getFieldError("model") && (
//                 <p id="model-error" className="text-xs text-destructive">
//                   {getFieldError("model")}
//                 </p>
//               )}
//             </div>

//             <div className="grid grid-cols-2 gap-4">
//               <div className="space-y-1.5">
//                 <Label htmlFor="year">Year</Label>
//                 <Input
//                   id="year"
//                   name="year"
//                   type="number"
//                   placeholder="e.g., 2015"
//                   value={formData.year}
//                   onChange={handleChange}
//                   min={1886} // Sensible minimum
//                   max={new Date().getFullYear() + 1}
//                 />
//                 {getFieldError("year") && (
//                   <p id="year-error" className="text-xs text-destructive">
//                     {getFieldError("year")}
//                   </p>
//                 )}
//               </div>
//               <div className="space-y-1.5">
//                 <Label htmlFor="vin">VIN</Label>
//                 <Input
//                   id="vin"
//                   name="vin"
//                   placeholder="11-17 characters"
//                   value={formData.vin}
//                   onChange={handleChange}
//                   minLength={11} // Match schema
//                   maxLength={17}
//                 />
//                 {getFieldError("vin") && (
//                   <p id="vin-error" className="text-xs text-destructive">
//                     {getFieldError("vin")}
//                   </p>
//                 )}
//               </div>
//             </div>
//             <Separator className="my-6" />

//             <div>
//               <h3 className="text-lg font-medium text-foreground mb-3">
//                 Initial Vehicle State <span className="text-sm text-muted-foreground">(Optional)</span>
//               </h3>
//               <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
//                 <div className="space-y-1.5">
//                   <Label htmlFor="initial_mileage">Initial Mileage (at acquisition)</Label>
//                   <div className="relative">
//                     <Gauge className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
//                     <Input
//                       id="initial_mileage"
//                       name="initial_mileage"
//                       type="number"
//                       placeholder="e.g., 15000"
//                       value={formData.initial_mileage}
//                       onChange={handleChange}
//                       min="0"
//                       className="pl-9"
//                     />
//                   </div>
//                   {getFieldError("initial_mileage") && (
//                     <p id="initial_mileage-error" className="text-xs text-destructive pt-1">
//                       {getFieldError("initial_mileage")}
//                     </p>
//                   )}
//                 </div>
//                 <div className="space-y-1.5">
//                   <Label htmlFor="acquisition_date">Acquisition Date</Label>
//                   <div className="relative">
//                     <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
//                     <Input
//                       id="acquisition_date"
//                       name="acquisition_date"
//                       type="date"
//                       value={formData.acquisition_date}
//                       onChange={handleChange}
//                       className="pl-9"
//                     />
//                   </div>
//                   {getFieldError("acquisition_date") && (
//                     <p id="acquisition_date-error" className="text-xs text-destructive pt-1">
//                       {getFieldError("acquisition_date")}
//                     </p>
//                   )}
//                 </div>
//               </div>
//               <p className="text-xs text-muted-foreground mt-2">Providing these helps in more accurate service tracking from the start.</p>
//             </div>
//           </CardContent>
//           <CardFooter className="flex justify-end gap-2 border-t px-6 py-4 bg-muted/50">
//             <Button type="button" variant="outline" onClick={() => navigate("/vehicles")} disabled={addVehicle.isPending}>
//               <XCircle className="mr-2 h-4 w-4" /> Cancel
//             </Button>
//             <Button type="submit" disabled={addVehicle.isPending}>
//               {addVehicle.isPending ? (
//                 <Loader2 className="mr-2 h-4 w-4 animate-spin" /> // Use Loader2 for spinner
//               ) : (
//                 <Save className="mr-2 h-4 w-4" />
//               )}
//               Add Vehicle
//             </Button>
//           </CardFooter>
//         </form>
//       </Card>
//     </div>
//   );
// }


import { useNavigate, Link } from "react-router-dom";
import { useAddVehicle } from "../api";
import { VehicleCreate } from "../types";
import { VehicleForm } from "@/components/VehicleForm"; // Import our new form
import { AxiosError } from "axios";

// UI Components
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Car, AlertTriangle } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

export function AddVehiclePage() {
  const navigate = useNavigate();
  const { mutate: addVehicle, isPending, error } = useAddVehicle();

  const handleSubmit = (payload: VehicleCreate) => {
    addVehicle(payload, {
      onSuccess: () => {
        // Navigate on success
        navigate("/vehicles");
      },
    });
  };

  // Helper to parse backend validation errors from the mutation's error state
  const getBackendErrors = () => {
    const axiosError = error as AxiosError<{ detail: any }>;
    if (axiosError?.response?.status === 422 && axiosError.response.data.detail) {
      return axiosError.response.data.detail.reduce((acc: Record<string, string[]>, err: any) => {
        const fieldKey = err.loc[1] || 'general';
        acc[fieldKey] = acc[fieldKey] ? [...acc[fieldKey], err.msg] : [err.msg];
        return acc;
      }, {});
    }
    return {};
  };

  const backendErrors = getBackendErrors();

  return (
    <div className="p-4 md:p-6 max-w-lg mx-auto">
      <Breadcrumb className="mb-6">
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink asChild><Link to="/vehicles">Vehicles</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>Add New Vehicle</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <Card className="pb-0">
        <CardHeader>
          <div className="flex items-center gap-3 mb-1">
            <Car className="h-7 w-7 text-primary" />
            <CardTitle className="text-2xl">Add New Vehicle</CardTitle>
          </div>
          <CardDescription>Enter the details of the vehicle you want to track.</CardDescription>
        </CardHeader>
        
        {/* Display general, non-field-specific errors here */}
        {error && !Object.keys(backendErrors).length && (
            <div className="px-6 pb-4">
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>An Error Occurred</AlertTitle>
                    <AlertDescription>{(error as any).response?.data?.detail || error.message}</AlertDescription>
                </Alert>
            </div>
        )}

        <VehicleForm
          onSubmit={handleSubmit}
          isSubmitting={isPending}
          backendErrors={backendErrors}
          mode="add"
        />
      </Card>
    </div>
  );
}